import { getAccessToken } from './ebay-auth';
import { syncEbay } from './ebay-sync';
import {
  categoryFromApi,
  signedApiAmountCents,
  slug,
  stableOrderItemId
} from './finance-normalize';
import { workspaceEntityId } from './workspace';

type EbayEnv = App.Platform['env'];
type Money = { value?: string; currency?: string };

type EbayLineItem = {
  lineItemId: string;
  legacyItemId?: string;
  title?: string;
  quantity?: number;
  lineItemCost?: Money;
};

type EbayOrder = {
  orderId: string;
  creationDate?: string;
  lastModifiedDate?: string;
  orderPaymentStatus?: string;
  total?: Money;
  pricingSummary?: { deliveryCost?: Money };
  lineItems?: EbayLineItem[];
};

type FinanceFee = { feeType?: string; amount?: Money };
type FinanceOrderLine = {
  lineItemId?: string;
  fees?: FinanceFee[];
  totalFeeAmount?: Money;
};

type FinanceTransaction = {
  transactionId: string;
  transactionType?: string;
  transactionDate?: string;
  amount?: Money;
  bookingEntry?: string;
  orderId?: string;
  feeType?: string;
  payoutId?: string;
  transactionMemo?: string;
  orderLineItems?: FinanceOrderLine[];
};

type InventoryLookupRow = {
  id: string;
  ebayItemId: string | null;
};

type MarketplaceMetadataRow = {
  metadataJson: string | null;
};

type HistoryMetadata = Record<string, unknown> & {
  ebayHistoryBackfill?: {
    version?: number;
    completedAt?: string;
    ordersFrom?: string;
    financesFrom?: string;
    ordersImported?: number;
    financeTransactionsImported?: number;
  };
};

const HISTORY_BACKFILL_VERSION = 1;
const RECENT_OVERLAP_DAYS = 90;
const ORDER_HISTORY_YEARS = 2;
const FINANCE_HISTORY_YEARS = 5;
const ORDER_CHUNK_DAYS = 90;
const FINANCE_CHUNK_DAYS = 180;
const DAY_MS = 86_400_000;

const cents = (value?: string) => Math.round(Number(value ?? 0) * 100);

function yearsAgo(date: Date, years: number) {
  const value = new Date(date);
  value.setUTCFullYear(value.getUTCFullYear() - years);
  return value;
}

function safeHistoryStart(date: Date, years: number) {
  // eBay validates these limits against its own current clock. Give ourselves
  // a one-day cushion so a long-running request never lands microscopically
  // outside the retention boundary.
  return new Date(yearsAgo(date, years).getTime() + DAY_MS);
}

function rangeFilter(start: Date, end: Date) {
  return `[${start.toISOString()}..${end.toISOString()}]`;
}

function chunkRanges(start: Date, end: Date, chunkDays: number) {
  const ranges: Array<{ start: Date; end: Date }> = [];
  let cursor = new Date(start);

  while (cursor.getTime() <= end.getTime()) {
    const chunkEnd = new Date(
      Math.min(end.getTime(), cursor.getTime() + chunkDays * DAY_MS - 1)
    );
    ranges.push({ start: new Date(cursor), end: chunkEnd });
    cursor = new Date(chunkEnd.getTime() + 1);
  }

  return ranges;
}

async function getPagedRest<T>(
  url: URL,
  accessToken: string,
  key: string,
  limit: number
) {
  const all: T[] = [];
  let offset = 0;

  for (let page = 0; page < 250; page += 1) {
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('offset', String(offset));

    const response = await fetch(url, {
      headers: {
        authorization: `Bearer ${accessToken}`,
        'x-ebay-c-marketplace-id': 'EBAY_US'
      }
    });

    if (response.status === 204) break;

    const payload = await response.json() as Record<string, unknown>;
    if (!response.ok) {
      const errors = payload.errors as { message?: string }[] | undefined;
      throw new Error(errors?.[0]?.message ?? 'Historical eBay data import failed.');
    }

    const rows = (payload[key] as T[] | undefined) ?? [];
    all.push(...rows);

    const total = Number(payload.total ?? rows.length);
    offset += rows.length;
    if (!rows.length || offset >= total) break;
  }

  return all;
}

async function fetchOrdersRange(accessToken: string, start: Date, end: Date) {
  const url = new URL('https://api.ebay.com/sell/fulfillment/v1/order');
  url.searchParams.set('filter', `creationdate:${rangeFilter(start, end)}`);
  return getPagedRest<EbayOrder>(url, accessToken, 'orders', 200);
}

async function fetchFinanceRange(accessToken: string, start: Date, end: Date) {
  const url = new URL('https://apiz.ebay.com/sell/finances/v1/transaction');
  url.searchParams.set('filter', `transactionDate:${rangeFilter(start, end)}`);
  return getPagedRest<FinanceTransaction>(url, accessToken, 'transactions', 1000);
}

async function runStatements(db: D1Database, statements: D1PreparedStatement[]) {
  for (let index = 0; index < statements.length; index += 100) {
    await db.batch(statements.slice(index, index + 100));
  }
}

async function loadHistoryMetadata(db: D1Database, workspaceId: string) {
  const row = await db.prepare(`
    SELECT metadata_json AS metadataJson
    FROM marketplace_accounts
    WHERE workspace_id = ?
      AND provider = 'ebay'
      AND external_account_id = 'primary'
    LIMIT 1
  `).bind(workspaceId).first<MarketplaceMetadataRow>();

  if (!row?.metadataJson) return {} as HistoryMetadata;

  try {
    return JSON.parse(row.metadataJson) as HistoryMetadata;
  } catch {
    return {} as HistoryMetadata;
  }
}

function historyAlreadyBackfilled(metadata: HistoryMetadata) {
  return metadata.ebayHistoryBackfill?.version === HISTORY_BACKFILL_VERSION &&
    Boolean(metadata.ebayHistoryBackfill.completedAt);
}

async function saveHistoryMetadata(
  db: D1Database,
  workspaceId: string,
  metadata: HistoryMetadata,
  details: {
    completedAt: string;
    ordersFrom: string;
    financesFrom: string;
    ordersImported: number;
    financeTransactionsImported: number;
  }
) {
  const next: HistoryMetadata = {
    ...metadata,
    ebayHistoryBackfill: {
      version: HISTORY_BACKFILL_VERSION,
      ...details
    }
  };

  await db.prepare(`
    UPDATE marketplace_accounts
    SET metadata_json = ?, updated_at = ?
    WHERE workspace_id = ?
      AND provider = 'ebay'
      AND external_account_id = 'primary'
  `).bind(
    JSON.stringify(next),
    details.completedAt,
    workspaceId
  ).run();
}

async function loadInventoryMap(db: D1Database, workspaceId: string) {
  const result = await db.prepare(`
    SELECT id, ebay_item_id AS ebayItemId
    FROM inventory_items
    WHERE workspace_id = ?
      AND ebay_item_id IS NOT NULL
  `).bind(workspaceId).all<InventoryLookupRow>();

  const map = new Map<string, string>();
  for (const row of result.results) {
    if (row.ebayItemId) map.set(row.ebayItemId, row.id);
  }
  return map;
}

async function writeHistoricalOrders(
  db: D1Database,
  workspaceId: string,
  orders: EbayOrder[],
  inventoryIdByEbayItemId: Map<string, string>
) {
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];

  for (const order of orders) {
    const soldAt = order.creationDate ?? order.lastModifiedDate ?? now;
    const orderDbId = workspaceEntityId(workspaceId, `ebay:${order.orderId}`);

    statements.push(db.prepare(`
      INSERT INTO orders (
        workspace_id, id, ebay_order_id, created_at_ebay, status,
        gross_total_cents, currency, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        gross_total_cents = excluded.gross_total_cents,
        currency = excluded.currency,
        updated_at = excluded.updated_at
    `).bind(
      workspaceId,
      orderDbId,
      order.orderId,
      soldAt,
      order.orderPaymentStatus ?? 'UNKNOWN',
      cents(order.total?.value),
      order.total?.currency ?? 'USD',
      now
    ));

    const lines = order.lineItems ?? [];
    const shippingShare = lines.length
      ? Math.round(cents(order.pricingSummary?.deliveryCost?.value) / lines.length)
      : 0;

    for (const line of lines) {
      const inventoryId = line.legacyItemId
        ? inventoryIdByEbayItemId.get(line.legacyItemId) ??
          workspaceEntityId(workspaceId, `ebay:${line.legacyItemId}`)
        : workspaceEntityId(workspaceId, `sold:${line.lineItemId}`);

      if (line.legacyItemId) {
        inventoryIdByEbayItemId.set(line.legacyItemId, inventoryId);
      }

      const orderItemId = workspaceEntityId(
        workspaceId,
        stableOrderItemId(order.orderId, line.legacyItemId, line.lineItemId)
      );

      statements.push(db.prepare(`
        INSERT INTO inventory_items (
          workspace_id, id, title, ebay_item_id, status, updated_at
        )
        VALUES (?, ?, ?, ?, 'sold', ?)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          ebay_item_id = COALESCE(excluded.ebay_item_id, inventory_items.ebay_item_id),
          status = 'sold',
          updated_at = excluded.updated_at
      `).bind(
        workspaceId,
        inventoryId,
        line.title ?? 'Untitled eBay item',
        line.legacyItemId ?? null,
        now
      ));

      statements.push(db.prepare(`
        INSERT INTO order_items (
          workspace_id, id, order_id, inventory_item_id, ebay_line_item_id,
          ebay_item_id, title, quantity, sale_price_cents,
          shipping_charged_cents, sold_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          inventory_item_id = excluded.inventory_item_id,
          ebay_line_item_id = excluded.ebay_line_item_id,
          ebay_item_id = excluded.ebay_item_id,
          title = excluded.title,
          quantity = excluded.quantity,
          sale_price_cents = excluded.sale_price_cents,
          shipping_charged_cents = excluded.shipping_charged_cents,
          sold_at = excluded.sold_at,
          updated_at = excluded.updated_at
      `).bind(
        workspaceId,
        orderItemId,
        orderDbId,
        inventoryId,
        line.lineItemId,
        line.legacyItemId ?? null,
        line.title ?? 'Untitled eBay item',
        line.quantity ?? 1,
        cents(line.lineItemCost?.value),
        shippingShare,
        soldAt,
        now
      ));
    }
  }

  await runStatements(db, statements);
}

async function writeHistoricalFinance(
  db: D1Database,
  workspaceId: string,
  transactions: FinanceTransaction[]
) {
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];

  for (const transaction of transactions) {
    const category = categoryFromApi(transaction.transactionType, transaction.feeType);
    const amountCents = signedApiAmountCents(
      transaction.amount?.value,
      transaction.bookingEntry,
      category
    );
    const lineItemId = transaction.orderLineItems?.[0]?.lineItemId ?? null;

    // Compatibility cleanup only: if legacy CSV rows overlap this authoritative
    // API transaction, remove the duplicate instead of double-counting it.
    if (category === 'shipping_label' && transaction.orderId) {
      statements.push(db.prepare(`
        DELETE FROM financial_transactions
        WHERE id IN (
          SELECT id
          FROM financial_transactions
          WHERE workspace_id = ?
            AND source = 'ebay_csv'
            AND category = 'shipping_label'
            AND ebay_order_id = ?
            AND amount_cents = ?
          LIMIT 1
        )
      `).bind(workspaceId, transaction.orderId, amountCents));
    }

    if (category === 'payout' && transaction.payoutId) {
      statements.push(db.prepare(`
        DELETE FROM financial_transactions
        WHERE workspace_id = ?
          AND source = 'ebay_csv'
          AND category = 'payout'
          AND payout_id = ?
      `).bind(workspaceId, transaction.payoutId));
    }

    if (category === 'sale') {
      statements.push(db.prepare(`
        DELETE FROM financial_transactions
        WHERE workspace_id = ?
          AND source = 'ebay_csv'
          AND category = 'selling_fee'
          AND reference_id = ?
      `).bind(workspaceId, transaction.transactionId));
    }

    const financeId = workspaceEntityId(
      workspaceId,
      `finance:${transaction.transactionId}`
    );

    statements.push(db.prepare(`
      INSERT INTO financial_transactions (
        workspace_id, id, ebay_transaction_id, ebay_order_id, ebay_line_item_id,
        transaction_type, amount_cents, currency, transaction_date, fee_type,
        booking_entry, category, source, description, payout_id, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ebay_api', ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        ebay_order_id = excluded.ebay_order_id,
        ebay_line_item_id = COALESCE(
          excluded.ebay_line_item_id,
          financial_transactions.ebay_line_item_id
        ),
        amount_cents = excluded.amount_cents,
        currency = excluded.currency,
        transaction_date = excluded.transaction_date,
        transaction_type = excluded.transaction_type,
        fee_type = excluded.fee_type,
        booking_entry = excluded.booking_entry,
        category = excluded.category,
        source = 'ebay_api',
        description = excluded.description,
        payout_id = excluded.payout_id,
        updated_at = excluded.updated_at
    `).bind(
      workspaceId,
      financeId,
      transaction.transactionId,
      transaction.orderId ?? null,
      lineItemId,
      transaction.transactionType ?? 'UNKNOWN',
      amountCents,
      transaction.amount?.currency ?? 'USD',
      transaction.transactionDate ?? now,
      transaction.feeType ?? null,
      transaction.bookingEntry ?? (amountCents < 0 ? 'DEBIT' : 'CREDIT'),
      category,
      transaction.transactionMemo ?? null,
      transaction.payoutId ?? null,
      now
    ));

    if (category === 'sale') {
      for (const [lineIndex, financeLine] of (transaction.orderLineItems ?? []).entries()) {
        for (const [feeIndex, fee] of (financeLine.fees ?? []).entries()) {
          const feeAmountCents = -Math.abs(cents(fee.amount?.value));
          if (!feeAmountCents) continue;

          const feeType = fee.feeType ?? `fee-${feeIndex + 1}`;
          const feeExternalId =
            `${transaction.transactionId}:fee:` +
            `${financeLine.lineItemId ?? lineIndex}:${slug(feeType)}:${feeIndex}`;

          statements.push(db.prepare(`
            INSERT INTO financial_transactions (
              workspace_id, id, ebay_transaction_id, ebay_order_id, ebay_line_item_id,
              transaction_type, amount_cents, currency, transaction_date, fee_type,
              booking_entry, category, source, description, reference_id, updated_at
            )
            VALUES (?, ?, ?, ?, ?, 'SELLING_FEE', ?, ?, ?, ?, 'DEBIT',
              'selling_fee', 'ebay_api', ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              ebay_order_id = excluded.ebay_order_id,
              ebay_line_item_id = excluded.ebay_line_item_id,
              amount_cents = excluded.amount_cents,
              currency = excluded.currency,
              transaction_date = excluded.transaction_date,
              fee_type = excluded.fee_type,
              source = 'ebay_api',
              description = excluded.description,
              reference_id = excluded.reference_id,
              updated_at = excluded.updated_at
          `).bind(
            workspaceId,
            workspaceEntityId(workspaceId, `finance:${feeExternalId}`),
            feeExternalId,
            transaction.orderId ?? null,
            financeLine.lineItemId ?? lineItemId,
            feeAmountCents,
            fee.amount?.currency ?? transaction.amount?.currency ?? 'USD',
            transaction.transactionDate ?? now,
            feeType,
            feeType,
            transaction.transactionId,
            now
          ));
        }
      }
    }
  }

  await runStatements(db, statements);
}

async function backfillEbayHistory(env: EbayEnv, workspaceId: string, metadata: HistoryMetadata) {
  const db = env.DB;
  const jobId = crypto.randomUUID();
  const startedAt = new Date().toISOString();

  await db.prepare(`
    INSERT INTO sync_jobs (workspace_id, id, status, started_at)
    VALUES (?, ?, 'running', ?)
  `).bind(workspaceId, jobId, startedAt).run();

  try {
    const accessToken = await getAccessToken(env, workspaceId);
    const now = new Date();
    const recentCutoff = new Date(now.getTime() - RECENT_OVERLAP_DAYS * DAY_MS);
    const historyEnd = new Date(recentCutoff.getTime() - 1);
    const orderStart = safeHistoryStart(now, ORDER_HISTORY_YEARS);
    const financeStart = safeHistoryStart(now, FINANCE_HISTORY_YEARS);
    const inventoryMap = await loadInventoryMap(db, workspaceId);

    let ordersImported = 0;
    let financeTransactionsImported = 0;

    for (const range of chunkRanges(orderStart, historyEnd, ORDER_CHUNK_DAYS)) {
      const orders = await fetchOrdersRange(accessToken, range.start, range.end);
      await writeHistoricalOrders(db, workspaceId, orders, inventoryMap);
      ordersImported += orders.length;
    }

    for (const range of chunkRanges(financeStart, historyEnd, FINANCE_CHUNK_DAYS)) {
      const transactions = await fetchFinanceRange(accessToken, range.start, range.end);
      await writeHistoricalFinance(db, workspaceId, transactions);
      financeTransactionsImported += transactions.length;
    }

    const completedAt = new Date().toISOString();
    await saveHistoryMetadata(db, workspaceId, metadata, {
      completedAt,
      ordersFrom: orderStart.toISOString(),
      financesFrom: financeStart.toISOString(),
      ordersImported,
      financeTransactionsImported
    });

    await db.prepare(`
      UPDATE sync_jobs
      SET status = 'completed', records_processed = ?, finished_at = ?
      WHERE id = ? AND workspace_id = ?
    `).bind(
      ordersImported + financeTransactionsImported,
      completedAt,
      jobId,
      workspaceId
    ).run();

    return {
      orders: ordersImported,
      transactions: financeTransactionsImported,
      ordersFrom: orderStart.toISOString(),
      financesFrom: financeStart.toISOString()
    };
  } catch (error) {
    await db.prepare(`
      UPDATE sync_jobs
      SET status = 'failed', error_message = ?, finished_at = ?
      WHERE id = ? AND workspace_id = ?
    `).bind(
      error instanceof Error ? error.message : 'Unknown eBay history backfill error',
      new Date().toISOString(),
      jobId,
      workspaceId
    ).run();
    throw error;
  }
}

export async function syncEbayAutomated(env: EbayEnv, workspaceId: string) {
  // Always refresh the rolling live window first. This remains the cheap path
  // used by every 30-minute scheduled sync after history is seeded.
  const live = await syncEbay(env, workspaceId);
  const metadata = await loadHistoryMetadata(env.DB, workspaceId);

  if (historyAlreadyBackfilled(metadata)) {
    return {
      ...live,
      historyBackfill: false,
      historyOrders: 0,
      historyTransactions: 0
    };
  }

  // First run only: seed the deepest history eBay exposes via API.
  // Fulfillment: roughly 2 years of order detail.
  // Finances: roughly 5 years of monetary transactions.
  const history = await backfillEbayHistory(env, workspaceId, metadata);

  return {
    ...live,
    orders: live.orders + history.orders,
    transactions: live.transactions + history.transactions,
    historyBackfill: true,
    historyOrders: history.orders,
    historyTransactions: history.transactions,
    historyOrdersFrom: history.ordersFrom,
    historyFinancesFrom: history.financesFrom
  };
}
