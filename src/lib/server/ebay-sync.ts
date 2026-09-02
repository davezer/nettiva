import { getAccessToken } from './ebay-auth';
import {
  categoryFromApi,
  csvLineItemRef,
  signedApiAmountCents,
  slug,
  stableOrderItemId
} from './finance-normalize';

type EbayEnv = App.Platform['env'];
type Money = { value?: string; currency?: string };
type ActiveListing = {
  itemId: string; title: string; sku: string | null; imageUrl: string | null;
  priceCents: number; quantity: number; listedAt: string | null;
  viewItemUrl: string | null; conditionName: string | null;
};
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

const cents = (value?: string) => Math.round(Number(value ?? 0) * 100);
const decodeXml = (value: string) => value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
function tag(xml: string, name: string) {
  const match = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return match ? decodeXml(match[1].trim()) : null;
}
function blocks(xml: string, name: string) {
  return [...xml.matchAll(new RegExp(`<${name}(?:\\s[^>]*)?>[\\s\\S]*?</${name}>`, 'gi'))].map((match) => match[0]);
}

async function fetchActiveListings(accessToken: string) {
  const collected: ActiveListing[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const requestXml = `<?xml version="1.0" encoding="utf-8"?>
      <GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">
        <DetailLevel>ReturnAll</DetailLevel>
        <ActiveList><Include>true</Include><Pagination><EntriesPerPage>200</EntriesPerPage><PageNumber>${page}</PageNumber></Pagination></ActiveList>
      </GetMyeBaySellingRequest>`;
    const response = await fetch('https://api.ebay.com/ws/api.dll', {
      method: 'POST',
      headers: {
        'content-type': 'text/xml',
        'x-ebay-api-call-name': 'GetMyeBaySelling',
        'x-ebay-api-compatibility-level': '1423',
        'x-ebay-api-siteid': '0',
        'x-ebay-api-iaf-token': accessToken
      },
      body: requestXml
    });
    const xml = await response.text();
    if (!response.ok || tag(xml, 'Ack') === 'Failure') throw new Error(tag(xml, 'LongMessage') || 'eBay listing import failed.');
    const activeXml = tag(xml, 'ActiveList') ?? '';
    for (const item of blocks(activeXml, 'Item')) {
      const itemId = tag(item, 'ItemID');
      const title = tag(item, 'Title');
      if (!itemId || !title) continue;
      collected.push({
        itemId,
        title,
        sku: tag(item, 'SKU'),
        imageUrl: tag(tag(item, 'PictureDetails') ?? '', 'GalleryURL'),
        priceCents: cents(tag(tag(item, 'SellingStatus') ?? '', 'CurrentPrice') ?? undefined),
        quantity: Number(tag(item, 'QuantityAvailable') ?? tag(item, 'Quantity') ?? 1),
        listedAt: tag(item, 'StartTime'),
        viewItemUrl: tag(tag(item, 'ListingDetails') ?? '', 'ViewItemURL'),
        conditionName: tag(item, 'ConditionDisplayName')
      });
    }
    totalPages = Math.min(Number(tag(tag(activeXml, 'PaginationResult') ?? '', 'TotalNumberOfPages') ?? 1), 25);
    page += 1;
  } while (page <= totalPages);
  return collected;
}

async function getPagedRest<T>(url: URL, accessToken: string, key: string) {
  const all: T[] = [];
  let offset = 0;
  for (let page = 0; page < 25; page += 1) {
    url.searchParams.set('limit', '200');
    url.searchParams.set('offset', String(offset));
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${accessToken}`, 'x-ebay-c-marketplace-id': 'EBAY_US' }
    });
    const payload = await response.json() as Record<string, unknown>;
    if (!response.ok) {
      const errors = payload.errors as { message?: string }[] | undefined;
      throw new Error(errors?.[0]?.message ?? 'eBay data import failed.');
    }
    const rows = (payload[key] as T[] | undefined) ?? [];
    all.push(...rows);
    const total = Number(payload.total ?? rows.length);
    offset += rows.length;
    if (!rows.length || offset >= total) break;
  }
  return all;
}

function ninetyDayWindow() {
  const end = new Date();
  const start = new Date(end.getTime() - 90 * 86_400_000);
  return `[${start.toISOString()}..${end.toISOString()}]`;
}

async function fetchOrders(accessToken: string) {
  const url = new URL('https://api.ebay.com/sell/fulfillment/v1/order');
  url.searchParams.set('filter', `creationdate:${ninetyDayWindow()}`);
  return getPagedRest<EbayOrder>(url, accessToken, 'orders');
}

async function fetchFinancialTransactions(accessToken: string) {
  const url = new URL('https://apiz.ebay.com/sell/finances/v1/transaction');
  url.searchParams.set('filter', `transactionDate:${ninetyDayWindow()}`);
  return getPagedRest<FinanceTransaction>(url, accessToken, 'transactions');
}

async function runStatements(db: D1Database, statements: D1PreparedStatement[]) {
  for (let index = 0; index < statements.length; index += 100) {
    await db.batch(statements.slice(index, index + 100));
  }
}

export async function syncEbay(env: EbayEnv) {
  const db = env.DB;
  const jobId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  await db.prepare('INSERT INTO sync_jobs (id, status, started_at) VALUES (?, ?, ?)').bind(jobId, 'running', startedAt).run();

  try {
    const accessToken = await getAccessToken(env);
    const [active, orders, transactions] = await Promise.all([
      fetchActiveListings(accessToken),
      fetchOrders(accessToken),
      fetchFinancialTransactions(accessToken)
    ]);
    const now = new Date().toISOString();
    const statements: D1PreparedStatement[] = [];

    for (const item of active) {
      statements.push(db.prepare(`
        INSERT INTO inventory_items (id, title, sku, ebay_item_id, condition_name, image_url, status, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'active', ?)
        ON CONFLICT(id) DO UPDATE SET title = excluded.title, sku = excluded.sku,
          condition_name = excluded.condition_name, image_url = excluded.image_url,
          status = 'active', updated_at = excluded.updated_at
      `).bind(`ebay:${item.itemId}`, item.title, item.sku, item.itemId, item.conditionName, item.imageUrl, now));
      statements.push(db.prepare(`
        INSERT INTO listings (id, inventory_item_id, ebay_listing_id, price_cents, quantity, listed_at, status, view_item_url, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)
        ON CONFLICT(id) DO UPDATE SET price_cents = excluded.price_cents,
          quantity = excluded.quantity, listed_at = excluded.listed_at,
          status = 'active', view_item_url = excluded.view_item_url, updated_at = excluded.updated_at
      `).bind(`ebay:${item.itemId}`, `ebay:${item.itemId}`, item.itemId, item.priceCents, item.quantity, item.listedAt, item.viewItemUrl, now));
    }

    for (const order of orders) {
      const soldAt = order.creationDate ?? order.lastModifiedDate ?? now;
      statements.push(db.prepare(`
        INSERT INTO orders (id, ebay_order_id, created_at_ebay, status, gross_total_cents, currency, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET status = excluded.status,
          gross_total_cents = excluded.gross_total_cents, updated_at = excluded.updated_at
      `).bind(`ebay:${order.orderId}`, order.orderId, soldAt, order.orderPaymentStatus ?? 'UNKNOWN', cents(order.total?.value), order.total?.currency ?? 'USD', now));

      const lines = order.lineItems ?? [];
      const shippingShare = lines.length ? Math.round(cents(order.pricingSummary?.deliveryCost?.value) / lines.length) : 0;
      for (const line of lines) {
        const inventoryId = line.legacyItemId ? `ebay:${line.legacyItemId}` : `sold:${line.lineItemId}`;
        const orderItemId = stableOrderItemId(order.orderId, line.legacyItemId, line.lineItemId);

        // Upgrade references created by a CSV import to the real eBay line-item ID.
        if (line.legacyItemId) {
          statements.push(db.prepare(`
            UPDATE financial_transactions
            SET ebay_line_item_id = ?, updated_at = ?
            WHERE ebay_order_id = ? AND ebay_line_item_id = ?
          `).bind(
            line.lineItemId,
            now,
            order.orderId,
            csvLineItemRef(order.orderId, line.legacyItemId, line.lineItemId)
          ));
        }

        statements.push(db.prepare(`
          INSERT INTO inventory_items (id, title, ebay_item_id, status, updated_at)
          VALUES (?, ?, ?, 'sold', ?)
          ON CONFLICT(id) DO UPDATE SET title = excluded.title, status = 'sold', updated_at = excluded.updated_at
        `).bind(inventoryId, line.title ?? 'Untitled eBay item', line.legacyItemId ?? null, now));
        statements.push(db.prepare(`
          INSERT INTO order_items (id, order_id, inventory_item_id, ebay_line_item_id, ebay_item_id, title, quantity, sale_price_cents, shipping_charged_cents, sold_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            inventory_item_id = excluded.inventory_item_id,
            ebay_line_item_id = excluded.ebay_line_item_id,
            title = excluded.title,
            sale_price_cents = excluded.sale_price_cents,
            shipping_charged_cents = excluded.shipping_charged_cents,
            updated_at = excluded.updated_at
        `).bind(
          orderItemId,
          `ebay:${order.orderId}`,
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

    for (const transaction of transactions) {
      const category = categoryFromApi(transaction.transactionType, transaction.feeType);
      const amountCents = signedApiAmountCents(transaction.amount?.value, transaction.bookingEntry, category);
      const lineItemId = transaction.orderLineItems?.[0]?.lineItemId ?? null;

      // When API data arrives after a CSV bootstrap, prefer the API copy.
      if (category === 'shipping_label' && transaction.orderId) {
        statements.push(db.prepare(`
          DELETE FROM financial_transactions
          WHERE id IN (
            SELECT id FROM financial_transactions
            WHERE source = 'ebay_csv'
              AND category = 'shipping_label'
              AND ebay_order_id = ?
              AND amount_cents = ?
            LIMIT 1
          )
        `).bind(transaction.orderId, amountCents));
      }

      if (category === 'payout' && transaction.payoutId) {
        statements.push(db.prepare(`
          DELETE FROM financial_transactions
          WHERE source = 'ebay_csv'
            AND category = 'payout'
            AND payout_id = ?
        `).bind(transaction.payoutId));
      }

      if (category === 'sale') {
        statements.push(db.prepare(`
          DELETE FROM financial_transactions
          WHERE source = 'ebay_csv'
            AND category = 'selling_fee'
            AND reference_id = ?
        `).bind(transaction.transactionId));
      }

      statements.push(db.prepare(`
        INSERT INTO financial_transactions (
          id, ebay_transaction_id, ebay_order_id, ebay_line_item_id,
          transaction_type, amount_cents, currency, transaction_date, fee_type,
          booking_entry, category, source, description, payout_id, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ebay_api', ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          ebay_order_id = excluded.ebay_order_id,
          ebay_line_item_id = COALESCE(excluded.ebay_line_item_id, financial_transactions.ebay_line_item_id),
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
        `finance:${transaction.transactionId}`,
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

      // SALE transaction amount is net of selling fees. Store fee detail as
      // separate debits so dashboard profit starts from gross order value.
      if (category === 'sale') {
        for (const [lineIndex, financeLine] of (transaction.orderLineItems ?? []).entries()) {
          for (const [feeIndex, fee] of (financeLine.fees ?? []).entries()) {
            const feeAmountCents = -Math.abs(cents(fee.amount?.value));
            if (!feeAmountCents) continue;

            const feeType = fee.feeType ?? `fee-${feeIndex + 1}`;
            const feeExternalId = `${transaction.transactionId}:fee:${financeLine.lineItemId ?? lineIndex}:${slug(feeType)}:${feeIndex}`;

            statements.push(db.prepare(`
              INSERT INTO financial_transactions (
                id, ebay_transaction_id, ebay_order_id, ebay_line_item_id,
                transaction_type, amount_cents, currency, transaction_date, fee_type,
                booking_entry, category, source, description, reference_id, updated_at
              )
              VALUES (?, ?, ?, ?, 'SELLING_FEE', ?, ?, ?, ?, 'DEBIT',
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
              `finance:${feeExternalId}`,
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
    const processed = active.length + orders.length + transactions.length;
    await db.batch([
      db.prepare('UPDATE ebay_accounts SET last_synced_at = ?, updated_at = ? WHERE id = ?').bind(now, now, 'primary'),
      db.prepare('UPDATE sync_jobs SET status = ?, records_processed = ?, finished_at = ? WHERE id = ?').bind('completed', processed, now, jobId)
    ]);
    return { listings: active.length, orders: orders.length, transactions: transactions.length };
  } catch (error) {
    await db.prepare('UPDATE sync_jobs SET status = ?, error_message = ?, finished_at = ? WHERE id = ?')
      .bind('failed', error instanceof Error ? error.message : 'Unknown sync error', new Date().toISOString(), jobId)
      .run();
    throw error;
  }
}
