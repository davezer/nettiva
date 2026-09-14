import { getAccessToken } from './ebay-auth';
import { workspaceEntityId } from './workspace';

type EbayEnv = App.Platform['env'];

type Money = {
  value?: string;
  currency?: string;
};

type RecentOrderRow = {
  externalOrderId: string;
};

type OrderLineRow = {
  externalLineItemId: string | null;
  grossCents: number;
};

type NormalizedOrderEarnings = {
  expensesCents: number | null;
  currency: string;
  raw: unknown;
};

const DEFAULT_DAYS = 90;
const MAX_CONCURRENCY = 4;

function cents(value: unknown): number | null {
  if (value == null) return null;

  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.round(value * 100) : null;
  }

  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[$,\s]/g, ''));
    return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
  }

  if (typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if ('value' in record) return cents(record.value);
    if ('amount' in record) return cents(record.amount);
  }

  return null;
}

function currencyFrom(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const currency = record.currency;
  return typeof currency === 'string' && currency.trim()
    ? currency.trim()
    : null;
}

function normalizedKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function directField(
  object: Record<string, unknown>,
  names: string[]
): unknown {
  const wanted = new Set(names.map(normalizedKey));

  for (const [key, value] of Object.entries(object)) {
    if (wanted.has(normalizedKey(key))) return value;
  }

  return undefined;
}

function findObjectForOrder(
  value: unknown,
  orderId: string,
  depth = 0
): Record<string, unknown> | null {
  if (depth > 8 || value == null) return null;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findObjectForOrder(item, orderId, depth + 1);
      if (found) return found;
    }
    return null;
  }

  if (typeof value !== 'object') return null;

  const record = value as Record<string, unknown>;
  const candidateOrderId = directField(record, [
    'orderId',
    'order_id',
    'externalOrderId'
  ]);

  if (
    typeof candidateOrderId === 'string' &&
    candidateOrderId === orderId
  ) {
    return record;
  }

  for (const child of Object.values(record)) {
    const found = findObjectForOrder(child, orderId, depth + 1);
    if (found) return found;
  }

  return null;
}

function firstObject(value: unknown, depth = 0): Record<string, unknown> | null {
  if (depth > 8 || value == null) return null;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstObject(item, depth + 1);
      if (found) return found;
    }
    return null;
  }

  if (typeof value !== 'object') return null;

  const record = value as Record<string, unknown>;

  // Prefer objects that look like an earnings payload.
  const looksLikeEarnings = [
    'expenses',
    'expenseAmount',
    'totalExpenseAmount',
    'grossAmount',
    'netOrderEarnings',
    'netOrderEarningsAmount'
  ].some((name) => directField(record, [name]) !== undefined);

  if (looksLikeEarnings) return record;

  for (const child of Object.values(record)) {
    const found = firstObject(child, depth + 1);
    if (found) return found;
  }

  return null;
}

function textHint(record: Record<string, unknown>) {
  return [
    directField(record, ['expenseType']),
    directField(record, ['feeType']),
    directField(record, ['type']),
    directField(record, ['name']),
    directField(record, ['description'])
  ]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();
}

function sumExpenseEntries(value: unknown): {
  cents: number;
  currency: string | null;
  found: boolean;
} {
  let total = 0;
  let found = false;
  let currency: string | null = null;

  function visit(node: unknown, depth: number) {
    if (depth > 8 || node == null) return;

    if (Array.isArray(node)) {
      for (const child of node) visit(child, depth + 1);
      return;
    }

    if (typeof node !== 'object') return;

    const record = node as Record<string, unknown>;
    const hint = textHint(record);

    // The Order Earnings API exposes shipping, buyer refunds and tax as
    // separate concepts. Never fold those into Sellquity's "selling fees".
    if (
      hint.includes('shipping') ||
      hint.includes('refund') ||
      hint.includes('tax')
    ) {
      return;
    }

    const amountField = directField(record, [
      'amount',
      'expenseAmount',
      'feeAmount',
      'totalAmount'
    ]);

    const amount = cents(amountField);
    if (amount != null && amount !== 0) {
      total += Math.abs(amount);
      found = true;
      currency ??= currencyFrom(amountField);
      return;
    }

    for (const child of Object.values(record)) {
      visit(child, depth + 1);
    }
  }

  visit(value, 0);
  return { cents: total, currency, found };
}

function normalizeOrderEarnings(
  payload: unknown,
  orderId: string
): NormalizedOrderEarnings {
  const object =
    findObjectForOrder(payload, orderId) ??
    firstObject(payload) ??
    (typeof payload === 'object' && payload && !Array.isArray(payload)
      ? payload as Record<string, unknown>
      : {});

  // eBay's Order Earnings resource exposes seller expenses independently
  // from shipping costs, buyer refunds and tax amounts. Prefer the aggregate
  // expense field whenever present.
  const aggregateExpense = directField(object, [
    'expenseAmount',
    'expensesAmount',
    'totalExpenseAmount',
    'totalExpensesAmount',
    'totalExpenses',
    'sellerExpenseAmount'
  ]);

  const aggregateCents = cents(aggregateExpense);
  if (aggregateCents != null) {
    return {
      expensesCents: Math.abs(aggregateCents),
      currency: currencyFrom(aggregateExpense) ?? 'USD',
      raw: payload
    };
  }

  // Some response shapes use an `expenses` container/list instead.
  const expenses = directField(object, ['expenses', 'expense']);
  if (expenses !== undefined) {
    const directExpensesCents = cents(expenses);

    if (directExpensesCents != null) {
      return {
        expensesCents: Math.abs(directExpensesCents),
        currency: currencyFrom(expenses) ?? 'USD',
        raw: payload
      };
    }

    const summed = sumExpenseEntries(expenses);
    if (summed.found) {
      return {
        expensesCents: summed.cents,
        currency: summed.currency ?? 'USD',
        raw: payload
      };
    }
  }

  return {
    expensesCents: null,
    currency: 'USD',
    raw: payload
  };
}

async function fetchOrderEarnings(
  accessToken: string,
  orderId: string
): Promise<{
  status: 'ok' | 'unavailable' | 'missing';
  earnings?: NormalizedOrderEarnings;
  warning?: string;
}> {
  const url =
    `https://apiz.ebay.com/sell/finances/v1/order_earnings/` +
    encodeURIComponent(orderId);

  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      'x-ebay-c-marketplace-id': 'EBAY_US'
    }
  });

  if (response.status === 204 || response.status === 404) {
    return { status: 'missing' };
  }

  const payload = await response.json().catch(() => null) as
    | Record<string, unknown>
    | null;

  if (!response.ok) {
    const errors = payload?.errors as Array<{ message?: string }> | undefined;
    const message =
      errors?.[0]?.message ??
      `eBay Order Earnings returned HTTP ${response.status}.`;

    // The Order Earnings resource is geographically limited by eBay. A user
    // who is not eligible should still be able to complete the normal sync.
    if (response.status === 400 || response.status === 403) {
      return { status: 'unavailable', warning: message };
    }

    throw new Error(message);
  }

  return {
    status: 'ok',
    earnings: normalizeOrderEarnings(payload, orderId)
  };
}

async function recentOrderIds(
  db: D1Database,
  workspaceId: string,
  days: number
) {
  const cutoff = new Date(
    Date.now() - days * 86_400_000
  ).toISOString();

  const result = await db.prepare(`
    SELECT DISTINCT
      COALESCE(external_order_id, ebay_order_id) AS externalOrderId
    FROM orders
    WHERE workspace_id = ?
      AND marketplace_provider = 'ebay'
      AND created_at_ebay >= ?
      AND COALESCE(external_order_id, ebay_order_id) IS NOT NULL
    ORDER BY created_at_ebay DESC
  `).bind(workspaceId, cutoff).all<RecentOrderRow>();

  return result.results
    .map((row) => row.externalOrderId)
    .filter(Boolean);
}

async function orderLines(
  db: D1Database,
  workspaceId: string,
  orderId: string
) {
  const result = await db.prepare(`
    SELECT
      COALESCE(
        oi.external_line_item_id,
        oi.ebay_line_item_id
      ) AS externalLineItemId,
      (
        COALESCE(oi.sale_price_cents, 0) +
        COALESCE(oi.shipping_charged_cents, 0)
      ) AS grossCents
    FROM order_items oi
    JOIN orders o
      ON o.id = oi.order_id
     AND o.workspace_id = oi.workspace_id
    WHERE oi.workspace_id = ?
      AND oi.marketplace_provider = 'ebay'
      AND COALESCE(o.external_order_id, o.ebay_order_id) = ?
    ORDER BY oi.id
  `).bind(workspaceId, orderId).all<OrderLineRow>();

  return result.results.map((row) => ({
    externalLineItemId: row.externalLineItemId,
    grossCents: Number(row.grossCents ?? 0)
  }));
}

function allocateCents(total: number, lines: OrderLineRow[]) {
  if (!lines.length || total <= 0) return [] as number[];
  if (lines.length === 1) return [total];

  const grossTotal = lines.reduce(
    (sum, line) => sum + Math.max(0, line.grossCents),
    0
  );

  if (grossTotal <= 0) {
    const base = Math.floor(total / lines.length);
    const allocations = lines.map(() => base);
    allocations[allocations.length - 1] +=
      total - base * lines.length;
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

async function writeAuthoritativeExpenses(
  db: D1Database,
  workspaceId: string,
  orderId: string,
  expenseCents: number,
  currency: string
) {
  const lines = await orderLines(db, workspaceId, orderId);
  if (!lines.length) return 0;

  const allocations = allocateCents(expenseCents, lines);
  const now = new Date().toISOString();

  const statements: D1PreparedStatement[] = [
    // Order Earnings is authoritative for total seller expenses. Remove older
    // fee rows for this order so the old transaction importer cannot
    // double-count them.
    db.prepare(`
      DELETE FROM financial_transactions
      WHERE workspace_id = ?
        AND marketplace_provider = 'ebay'
        AND category = 'selling_fee'
        AND COALESCE(external_order_id, ebay_order_id) = ?
    `).bind(workspaceId, orderId)
  ];

  for (let index = 0; index < lines.length; index += 1) {
    const amount = allocations[index] ?? 0;
    if (amount <= 0) continue;

    const line = lines[index];
    const syntheticId = `order-earnings:${orderId}:${line.externalLineItemId ?? index}`;
    const rowId = workspaceEntityId(workspaceId, syntheticId);

    statements.push(
      db.prepare(`
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
          'ORDER_EARNINGS_EXPENSE',
          ?, ?, ?,
          'ORDER_EARNINGS_EXPENSE',
          'DEBIT',
          'selling_fee',
          'ebay_order_earnings',
          'eBay seller expenses',
          ?,
          ?
        )
        ON CONFLICT(id) DO UPDATE SET
          ebay_order_id = excluded.ebay_order_id,
          ebay_line_item_id = excluded.ebay_line_item_id,
          marketplace_provider = 'ebay',
          external_transaction_id = excluded.external_transaction_id,
          external_order_id = excluded.external_order_id,
          external_line_item_id = excluded.external_line_item_id,
          amount_cents = excluded.amount_cents,
          currency = excluded.currency,
          transaction_date = excluded.transaction_date,
          fee_type = excluded.fee_type,
          booking_entry = 'DEBIT',
          category = 'selling_fee',
          source = 'ebay_order_earnings',
          description = excluded.description,
          reference_id = excluded.reference_id,
          updated_at = excluded.updated_at
      `).bind(
        workspaceId,
        rowId,
        syntheticId,
        orderId,
        line.externalLineItemId,
        syntheticId,
        orderId,
        line.externalLineItemId,
        -amount,
        currency,
        now,
        orderId,
        now
      )
    );
  }

  await db.batch(statements);
  return statements.length - 1;
}

async function mapLimit<T, R>(
  values: T[],
  concurrency: number,
  worker: (value: T) => Promise<R>
) {
  const results: R[] = new Array(values.length);
  let cursor = 0;

  async function run() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= values.length) return;
      results[index] = await worker(values[index]);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, values.length) },
      () => run()
    )
  );

  return results;
}

/**
 * Pulls eBay's dedicated Order Earnings resource and replaces Sellquity's
 * transaction-derived selling-fee rows with eBay's authoritative order-level
 * seller expense amount.
 *
 * Shipping labels remain their own financial rows; eBay documents shipping
 * costs separately from Order Earnings expenses.
 */
export async function syncRecentEbayOrderEarnings(
  env: EbayEnv,
  workspaceId: string,
  days = DEFAULT_DAYS
) {
  const db = env.DB;
  const accessToken = await getAccessToken(env, workspaceId);
  const orderIds = await recentOrderIds(db, workspaceId, days);

  let unavailableWarning: string | null = null;
  let ordersUpdated = 0;
  let feeRowsWritten = 0;
  let noEarningsYet = 0;
  let noExpenseValue = 0;

  await mapLimit(
    orderIds,
    MAX_CONCURRENCY,
    async (orderId) => {
      const result = await fetchOrderEarnings(accessToken, orderId);

      if (result.status === 'unavailable') {
        unavailableWarning ??= result.warning ??
          'eBay Order Earnings is unavailable for this seller.';
        return;
      }

      if (result.status === 'missing') {
        noEarningsYet += 1;
        return;
      }

      const expenseCents = result.earnings?.expensesCents;
      if (expenseCents == null) {
        noExpenseValue += 1;
        console.warn(
          `Sellquity could not read eBay Order Earnings expenses for order ${orderId}.`,
          result.earnings?.raw
        );
        return;
      }

      const written = await writeAuthoritativeExpenses(
        db,
        workspaceId,
        orderId,
        expenseCents,
        result.earnings?.currency ?? 'USD'
      );

      if (written > 0) {
        ordersUpdated += 1;
        feeRowsWritten += written;
      }
    }
  );

  return {
    ordersChecked: orderIds.length,
    ordersUpdated,
    feeRowsWritten,
    noEarningsYet,
    noExpenseValue,
    warning: unavailableWarning
  };
}
