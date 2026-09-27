import { getAccessToken } from './ebay-auth';
import { categoryFromApi, signedApiAmountCents, slug } from './finance-normalize';
import { workspaceEntityId } from './workspace';

type EbayEnv = App.Platform['env'];

type Money = {
  value?: string;
  currency?: string;
};

type FinanceFee = {
  feeType?: string;
  amount?: Money;
};

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
  totalFeeAmount?: Money;
};

type LocalOrderLine = {
  externalLineItemId: string | null;
  grossCents: number;
};

const DAY_MS = 86_400_000;
const DEFAULT_DAYS = 180;

function cents(value?: string | null) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

function range(days: number) {
  const end = new Date();
  const start = new Date(end.getTime() - Math.max(1, days) * DAY_MS);
  return `[${start.toISOString()}..${end.toISOString()}]`;
}

async function fetchTransactions(accessToken: string, days: number) {
  const url = new URL('https://apiz.ebay.com/sell/finances/v1/transaction');
  url.searchParams.set('filter', `transactionDate:${range(days)}`);

  const all: FinanceTransaction[] = [];
  let offset = 0;

  for (let page = 0; page < 100; page += 1) {
    url.searchParams.set('limit', '1000');
    url.searchParams.set('offset', String(offset));

    const response = await fetch(url, {
      headers: {
        authorization: `Bearer ${accessToken}`,
        'x-ebay-c-marketplace-id': 'EBAY_US'
      }
    });

    if (response.status === 204) break;

    const payload = await response.json().catch(() => null) as
      | { transactions?: FinanceTransaction[]; total?: number; errors?: { message?: string }[] }
      | null;

    if (!response.ok) {
      throw new Error(
        payload?.errors?.[0]?.message ??
        `eBay Finances reconciliation returned HTTP ${response.status}.`
      );
    }

    const rows = payload?.transactions ?? [];
    all.push(...rows);
    offset += rows.length;

    const total = Number(payload?.total ?? rows.length);
    if (!rows.length || offset >= total) break;
  }

  return all;
}

async function runStatements(db: D1Database, statements: D1PreparedStatement[]) {
  for (let index = 0; index < statements.length; index += 100) {
    await db.batch(statements.slice(index, index + 100));
  }
}

async function loadOrderLines(
  db: D1Database,
  workspaceId: string,
  orderId: string
): Promise<LocalOrderLine[]> {
  const result = await db.prepare(`
    SELECT
      COALESCE(oi.external_line_item_id, oi.ebay_line_item_id) AS externalLineItemId,
      COALESCE(oi.sale_price_cents, 0) + COALESCE(oi.shipping_charged_cents, 0) AS grossCents
    FROM order_items oi
    JOIN orders o
      ON o.id = oi.order_id
     AND o.workspace_id = oi.workspace_id
    WHERE oi.workspace_id = ?
      AND oi.marketplace_provider = 'ebay'
      AND COALESCE(o.external_order_id, o.ebay_order_id) = ?
    ORDER BY oi.id
  `).bind(workspaceId, orderId).all<LocalOrderLine>();

  return result.results.map((row) => ({
    externalLineItemId: row.externalLineItemId,
    grossCents: Number(row.grossCents ?? 0)
  }));
}

function allocateCents(total: number, lines: LocalOrderLine[]) {
  if (total <= 0 || !lines.length) return [] as number[];
  if (lines.length === 1) return [total];

  const grossTotal = lines.reduce(
    (sum, line) => sum + Math.max(0, line.grossCents),
    0
  );

  if (grossTotal <= 0) {
    const base = Math.floor(total / lines.length);
    const allocations = lines.map(() => base);
    allocations[allocations.length - 1] += total - base * lines.length;
    return allocations;
  }

  let assigned = 0;
  return lines.map((line, index) => {
    if (index === lines.length - 1) return total - assigned;
    const share = Math.round(
      total * (Math.max(0, line.grossCents) / grossTotal)
    );
    assigned += share;
    return share;
  });
}

function canonicalLineId(transaction: FinanceTransaction) {
  return transaction.orderLineItems?.find((line) => line.lineItemId)?.lineItemId ?? null;
}

function baseTransactionStatement(
  db: D1Database,
  workspaceId: string,
  transaction: FinanceTransaction,
  category: ReturnType<typeof categoryFromApi>,
  now: string
) {
  const transactionId = transaction.transactionId;
  const orderId = transaction.orderId ?? null;
  const lineItemId = canonicalLineId(transaction);
  const amountCents = signedApiAmountCents(
    transaction.amount?.value,
    transaction.bookingEntry,
    category
  );

  return db.prepare(`
    INSERT INTO financial_transactions (
      workspace_id,
      id,
      ebay_transaction_id,
      ebay_order_id,
      ebay_line_item_id,
      marketplace_provider,
      external_transaction_id,
      external_order_id,
      external_line_item_id,
      transaction_type,
      amount_cents,
      currency,
      transaction_date,
      fee_type,
      booking_entry,
      category,
      source,
      description,
      payout_id,
      updated_at
    )
    VALUES (
      ?, ?, ?, ?, ?,
      'ebay', ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?,
      'ebay_api', ?, ?, ?
    )
    ON CONFLICT(id) DO UPDATE SET
      ebay_order_id = excluded.ebay_order_id,
      ebay_line_item_id = COALESCE(excluded.ebay_line_item_id, financial_transactions.ebay_line_item_id),
      marketplace_provider = 'ebay',
      external_transaction_id = excluded.external_transaction_id,
      external_order_id = excluded.external_order_id,
      external_line_item_id = COALESCE(excluded.external_line_item_id, financial_transactions.external_line_item_id),
      transaction_type = excluded.transaction_type,
      amount_cents = excluded.amount_cents,
      currency = excluded.currency,
      transaction_date = excluded.transaction_date,
      fee_type = excluded.fee_type,
      booking_entry = excluded.booking_entry,
      category = excluded.category,
      source = 'ebay_api',
      description = excluded.description,
      payout_id = excluded.payout_id,
      updated_at = excluded.updated_at
  `).bind(
    workspaceId,
    workspaceEntityId(workspaceId, `finance:${transactionId}`),
    transactionId,
    orderId,
    lineItemId,
    transactionId,
    orderId,
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
  );
}

function syntheticCostStatement(
  db: D1Database,
  workspaceId: string,
  args: {
    externalId: string;
    orderId: string;
    lineItemId: string | null;
    amountCents: number;
    currency: string;
    transactionDate: string;
    category: 'selling_fee' | 'shipping_label';
    feeType: string;
    description: string;
    referenceId: string;
  },
  now: string
) {
  return db.prepare(`
    INSERT INTO financial_transactions (
      workspace_id,
      id,
      ebay_transaction_id,
      ebay_order_id,
      ebay_line_item_id,
      marketplace_provider,
      external_transaction_id,
      external_order_id,
      external_line_item_id,
      transaction_type,
      amount_cents,
      currency,
      transaction_date,
      fee_type,
      booking_entry,
      category,
      source,
      description,
      reference_id,
      updated_at
    )
    VALUES (
      ?, ?, ?, ?, ?,
      'ebay', ?, ?, ?,
      ?, ?, ?, ?, ?,
      'DEBIT', ?, 'ebay_finance_reconcile', ?, ?, ?
    )
    ON CONFLICT(id) DO UPDATE SET
      ebay_order_id = excluded.ebay_order_id,
      ebay_line_item_id = excluded.ebay_line_item_id,
      marketplace_provider = 'ebay',
      external_transaction_id = excluded.external_transaction_id,
      external_order_id = excluded.external_order_id,
      external_line_item_id = excluded.external_line_item_id,
      transaction_type = excluded.transaction_type,
      amount_cents = excluded.amount_cents,
      currency = excluded.currency,
      transaction_date = excluded.transaction_date,
      fee_type = excluded.fee_type,
      booking_entry = 'DEBIT',
      category = excluded.category,
      source = 'ebay_finance_reconcile',
      description = excluded.description,
      reference_id = excluded.reference_id,
      updated_at = excluded.updated_at
  `).bind(
    workspaceId,
    workspaceEntityId(workspaceId, `finance:${args.externalId}`),
    args.externalId,
    args.orderId,
    args.lineItemId,
    args.externalId,
    args.orderId,
    args.lineItemId,
    args.category === 'selling_fee' ? 'SELLING_FEE' : 'SHIPPING_LABEL',
    -Math.abs(args.amountCents),
    args.currency,
    args.transactionDate,
    args.feeType,
    args.category,
    args.description,
    args.referenceId,
    now
  );
}

function explicitFeeStatements(
  db: D1Database,
  workspaceId: string,
  transaction: FinanceTransaction,
  now: string
) {
  const statements: D1PreparedStatement[] = [];
  const orderId = transaction.orderId;
  if (!orderId) return statements;

  const transactionDate = transaction.transactionDate ?? now;
  const fallbackCurrency = transaction.amount?.currency ?? 'USD';

  for (const [lineIndex, line] of (transaction.orderLineItems ?? []).entries()) {
    for (const [feeIndex, fee] of (line.fees ?? []).entries()) {
      const amount = Math.abs(cents(fee.amount?.value));
      if (!amount) continue;

      const feeType = fee.feeType ?? `fee-${feeIndex + 1}`;
      const externalId =
        `${transaction.transactionId}:fee:` +
        `${line.lineItemId ?? lineIndex}:${slug(feeType)}:${feeIndex}`;

      statements.push(syntheticCostStatement(db, workspaceId, {
        externalId,
        orderId,
        lineItemId: line.lineItemId ?? null,
        amountCents: amount,
        currency: fee.amount?.currency ?? fallbackCurrency,
        transactionDate,
        category: 'selling_fee',
        feeType,
        description: feeType,
        referenceId: transaction.transactionId
      }, now));
    }
  }

  return statements;
}

function lineTotalFeeStatements(
  db: D1Database,
  workspaceId: string,
  transaction: FinanceTransaction,
  now: string
) {
  const statements: D1PreparedStatement[] = [];
  const orderId = transaction.orderId;
  if (!orderId) return statements;

  const transactionDate = transaction.transactionDate ?? now;
  const fallbackCurrency = transaction.amount?.currency ?? 'USD';

  for (const [lineIndex, line] of (transaction.orderLineItems ?? []).entries()) {
    const amount = Math.abs(cents(line.totalFeeAmount?.value));
    if (!amount) continue;

    const externalId =
      `${transaction.transactionId}:fee-total:${line.lineItemId ?? lineIndex}`;

    statements.push(syntheticCostStatement(db, workspaceId, {
      externalId,
      orderId,
      lineItemId: line.lineItemId ?? null,
      amountCents: amount,
      currency: line.totalFeeAmount?.currency ?? fallbackCurrency,
      transactionDate,
      category: 'selling_fee',
      feeType: 'TOTAL_FEE_AMOUNT',
      description: 'eBay selling fees',
      referenceId: transaction.transactionId
    }, now));
  }

  return statements;
}

async function transactionTotalFeeStatements(
  db: D1Database,
  workspaceId: string,
  transaction: FinanceTransaction,
  now: string,
  lines: LocalOrderLine[]
) {
  const orderId = transaction.orderId;
  const total = Math.abs(cents(transaction.totalFeeAmount?.value));
  if (!orderId || !total) return [] as D1PreparedStatement[];

  const transactionDate = transaction.transactionDate ?? now;
  const currency = transaction.totalFeeAmount?.currency ?? transaction.amount?.currency ?? 'USD';

  if (!lines.length) {
    return [syntheticCostStatement(db, workspaceId, {
      externalId: `${transaction.transactionId}:fee-total:order`,
      orderId,
      lineItemId: null,
      amountCents: total,
      currency,
      transactionDate,
      category: 'selling_fee',
      feeType: 'TOTAL_FEE_AMOUNT',
      description: 'eBay selling fees',
      referenceId: transaction.transactionId
    }, now)];
  }

  const allocations = allocateCents(total, lines);
  return lines.flatMap((line, index) => {
    const amount = allocations[index] ?? 0;
    if (!amount) return [];
    return [syntheticCostStatement(db, workspaceId, {
      externalId: `${transaction.transactionId}:fee-total:${line.externalLineItemId ?? index}`,
      orderId,
      lineItemId: line.externalLineItemId,
      amountCents: amount,
      currency,
      transactionDate,
      category: 'selling_fee',
      feeType: 'TOTAL_FEE_AMOUNT',
      description: 'eBay selling fees',
      referenceId: transaction.transactionId
    }, now)];
  });
}

async function shippingLabelStatements(
  db: D1Database,
  workspaceId: string,
  transaction: FinanceTransaction,
  now: string,
  lines: LocalOrderLine[]
) {
  const orderId = transaction.orderId;
  const amount = Math.abs(signedApiAmountCents(
    transaction.amount?.value,
    transaction.bookingEntry,
    'shipping_label'
  ));

  if (!orderId || !amount || !lines.length) return [] as D1PreparedStatement[];

  const allocations = allocateCents(amount, lines);
  const currency = transaction.amount?.currency ?? 'USD';
  const transactionDate = transaction.transactionDate ?? now;

  return lines.flatMap((line, index) => {
    const allocated = allocations[index] ?? 0;
    if (!allocated) return [];

    return [syntheticCostStatement(db, workspaceId, {
      externalId: `${transaction.transactionId}:shipping:${line.externalLineItemId ?? index}`,
      orderId,
      lineItemId: line.externalLineItemId,
      amountCents: allocated,
      currency,
      transactionDate,
      category: 'shipping_label',
      feeType: transaction.feeType ?? 'SHIPPING_LABEL',
      description: transaction.transactionMemo ?? 'eBay shipping label',
      referenceId: transaction.transactionId
    }, now)];
  });
}

/**
 * Re-reads eBay's Finances transaction feed and repairs the canonical
 * transaction/order/line identities used by Sellquity sale-level reporting.
 *
 * It also recovers selling fees from all documented transaction shapes:
 * individual fee entries, per-line totalFeeAmount, and transaction-level
 * totalFeeAmount. Order-level shipping label charges are allocated across the
 * order's Sellquity line items so multi-item orders do not double-count them.
 */
export async function reconcileRecentEbayFinances(
  env: EbayEnv,
  workspaceId: string,
  days = DEFAULT_DAYS
) {
  const db = env.DB;
  const accessToken = await getAccessToken(env, workspaceId);
  const transactions = await fetchTransactions(accessToken, days);
  const now = new Date().toISOString();
  const lineCache = new Map<string, LocalOrderLine[]>();

  let sellingFeeRows = 0;
  let shippingLabelRows = 0;
  let canonicalRows = 0;
  let saleTransactions = 0;

  async function linesFor(orderId: string) {
    const cached = lineCache.get(orderId);
    if (cached) return cached;
    const loaded = await loadOrderLines(db, workspaceId, orderId);
    lineCache.set(orderId, loaded);
    return loaded;
  }

  for (const transaction of transactions) {
    if (!transaction.transactionId) continue;

    const category = categoryFromApi(
      transaction.transactionType,
      transaction.feeType
    );

    const statements: D1PreparedStatement[] = [];
    const orderId = transaction.orderId ?? null;

    if (category === 'shipping_label' && orderId) {
      const lines = await linesFor(orderId);
      const allocated = await shippingLabelStatements(
        db,
        workspaceId,
        transaction,
        now,
        lines
      );

      if (allocated.length) {
        statements.push(db.prepare(`
          DELETE FROM financial_transactions
          WHERE workspace_id = ?
            AND marketplace_provider = 'ebay'
            AND (
              external_transaction_id = ?
              OR ebay_transaction_id = ?
              OR reference_id = ?
            )
            AND category = 'shipping_label'
        `).bind(
          workspaceId,
          transaction.transactionId,
          transaction.transactionId,
          transaction.transactionId
        ));
        statements.push(...allocated);
        shippingLabelRows += allocated.length;
      } else {
        statements.push(baseTransactionStatement(
          db,
          workspaceId,
          transaction,
          category,
          now
        ));
        canonicalRows += 1;
      }

      await runStatements(db, statements);
      continue;
    }

    statements.push(baseTransactionStatement(
      db,
      workspaceId,
      transaction,
      category,
      now
    ));
    canonicalRows += 1;

    if (category === 'sale' && orderId) {
      saleTransactions += 1;

      // Remove the previous derived rows for this SALE transaction, plus a
      // stale Order Earnings replacement. The Order Earnings pass runs after
      // this reconciler and will replace these again when that API is available.
      statements.push(db.prepare(`
        DELETE FROM financial_transactions
        WHERE workspace_id = ?
          AND marketplace_provider = 'ebay'
          AND category = 'selling_fee'
          AND COALESCE(external_order_id, ebay_order_id) = ?
          AND (
            reference_id = ?
            OR source = 'ebay_order_earnings'
          )
      `).bind(workspaceId, orderId, transaction.transactionId));

      let feeStatements = explicitFeeStatements(
        db,
        workspaceId,
        transaction,
        now
      );

      if (!feeStatements.length) {
        feeStatements = lineTotalFeeStatements(
          db,
          workspaceId,
          transaction,
          now
        );
      }

      if (!feeStatements.length) {
        feeStatements = await transactionTotalFeeStatements(
          db,
          workspaceId,
          transaction,
          now,
          await linesFor(orderId)
        );
      }

      statements.push(...feeStatements);
      sellingFeeRows += feeStatements.length;
    }

    await runStatements(db, statements);
  }

  return {
    days,
    transactionsRead: transactions.length,
    canonicalRows,
    saleTransactions,
    sellingFeeRows,
    shippingLabelRows
  };
}
