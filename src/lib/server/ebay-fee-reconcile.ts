import { getAccessToken } from './ebay-auth';
import { slug } from './finance-normalize';
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
  // Finances API uses orderLineItemId. Keep lineItemId as a compatibility
  // fallback for any older/cached payload shape.
  orderLineItemId?: string;
  lineItemId?: string;
  fees?: FinanceFee[];
  totalFeeAmount?: Money;
};

type FinanceSaleTransaction = {
  transactionId: string;
  transactionType?: string;
  transactionDate?: string;
  orderId?: string;
  amount?: Money;
  totalFeeAmount?: Money;
  orderLineItems?: FinanceOrderLine[];
};

type ReconciledFee = {
  id: string;
  ebayTransactionId: string;
  orderId: string | null;
  lineItemId: string | null;
  amountCents: number;
  currency: string;
  transactionDate: string;
  feeType: string;
  description: string;
  referenceId: string;
};

const DAY_MS = 86_400_000;

function cents(value?: string) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

function recentWindow(days: number) {
  const end = new Date();
  const start = new Date(end.getTime() - days * DAY_MS);
  return `[${start.toISOString()}..${end.toISOString()}]`;
}

async function fetchRecentSales(accessToken: string, days: number) {
  const transactions: FinanceSaleTransaction[] = [];
  let offset = 0;

  for (let page = 0; page < 50; page += 1) {
    const url = new URL('https://apiz.ebay.com/sell/finances/v1/transaction');

    // eBay documents repeated filter parameters for combined filters.
    url.searchParams.append('filter', 'transactionType:{SALE}');
    url.searchParams.append('filter', `transactionDate:${recentWindow(days)}`);
    url.searchParams.set('limit', '1000');
    url.searchParams.set('offset', String(offset));

    const response = await fetch(url, {
      headers: {
        authorization: `Bearer ${accessToken}`,
        'x-ebay-c-marketplace-id': 'EBAY_US'
      }
    });

    if (response.status === 204) break;

    const payload = await response.json() as {
      transactions?: FinanceSaleTransaction[];
      total?: number;
      errors?: Array<{ message?: string }>;
    };

    if (!response.ok) {
      throw new Error(
        payload.errors?.[0]?.message ??
        'Could not reconcile eBay selling fees.'
      );
    }

    const rows = payload.transactions ?? [];
    transactions.push(...rows);

    offset += rows.length;
    const total = Number(payload.total ?? rows.length);
    if (!rows.length || offset >= total) break;
  }

  return transactions;
}

function financeLineId(line: FinanceOrderLine) {
  return line.orderLineItemId?.trim() || line.lineItemId?.trim() || null;
}

function granularFees(
  workspaceId: string,
  transaction: FinanceSaleTransaction,
  now: string
) {
  const rows: ReconciledFee[] = [];

  for (const [lineIndex, line] of (transaction.orderLineItems ?? []).entries()) {
    const lineId = financeLineId(line);

    for (const [feeIndex, fee] of (line.fees ?? []).entries()) {
      const feeAmount = Math.abs(cents(fee.amount?.value));
      if (!feeAmount) continue;

      const feeType = fee.feeType?.trim() || `fee-${feeIndex + 1}`;
      const externalId =
        `${transaction.transactionId}:fee:` +
        `${lineId ?? lineIndex}:${slug(feeType)}:${feeIndex}`;

      rows.push({
        id: workspaceEntityId(workspaceId, `finance:${externalId}`),
        ebayTransactionId: externalId,
        orderId: transaction.orderId ?? null,
        lineItemId: lineId,
        amountCents: -feeAmount,
        currency:
          fee.amount?.currency ??
          transaction.amount?.currency ??
          transaction.totalFeeAmount?.currency ??
          'USD',
        transactionDate: transaction.transactionDate ?? now,
        feeType,
        description: feeType,
        referenceId: transaction.transactionId
      });
    }
  }

  return rows;
}

function totalFeeFallback(
  workspaceId: string,
  transaction: FinanceSaleTransaction,
  now: string
) {
  const rows: ReconciledFee[] = [];
  const lines = transaction.orderLineItems ?? [];

  // Some eBay SALE payloads expose line-level totalFeeAmount even when the
  // detailed fees array is absent. Prefer those because they can be matched
  // safely to the exact sold line item.
  for (const [lineIndex, line] of lines.entries()) {
    const feeAmount = Math.abs(cents(line.totalFeeAmount?.value));
    if (!feeAmount) continue;

    const lineId = financeLineId(line);
    const externalId =
      `${transaction.transactionId}:fee-total:${lineId ?? lineIndex}`;

    rows.push({
      id: workspaceEntityId(workspaceId, `finance:${externalId}`),
      ebayTransactionId: externalId,
      orderId: transaction.orderId ?? null,
      lineItemId: lineId,
      amountCents: -feeAmount,
      currency:
        line.totalFeeAmount?.currency ??
        transaction.totalFeeAmount?.currency ??
        transaction.amount?.currency ??
        'USD',
      transactionDate: transaction.transactionDate ?? now,
      feeType: 'TOTAL_SELLING_FEES',
      description: 'eBay selling fees',
      referenceId: transaction.transactionId
    });
  }

  if (rows.length) return rows;

  // Last-resort order-level total. For a one-line order this attaches cleanly
  // through Sellquity's existing order fallback. For multi-line orders we keep
  // it order-level rather than guessing an allocation and overstating fees.
  const totalFee = Math.abs(cents(transaction.totalFeeAmount?.value));
  if (!totalFee) return rows;

  const externalId = `${transaction.transactionId}:fee-total:order`;

  rows.push({
    id: workspaceEntityId(workspaceId, `finance:${externalId}`),
    ebayTransactionId: externalId,
    orderId: transaction.orderId ?? null,
    lineItemId: null,
    amountCents: -totalFee,
    currency:
      transaction.totalFeeAmount?.currency ??
      transaction.amount?.currency ??
      'USD',
    transactionDate: transaction.transactionDate ?? now,
    feeType: 'TOTAL_SELLING_FEES',
    description: 'eBay selling fees',
    referenceId: transaction.transactionId
  });

  return rows;
}

function feeRowsForTransaction(
  workspaceId: string,
  transaction: FinanceSaleTransaction,
  now: string
) {
  const detailed = granularFees(workspaceId, transaction, now);
  return detailed.length
    ? detailed
    : totalFeeFallback(workspaceId, transaction, now);
}

async function runStatements(
  db: D1Database,
  statements: D1PreparedStatement[]
) {
  for (let index = 0; index < statements.length; index += 100) {
    await db.batch(statements.slice(index, index + 100));
  }
}

/**
 * Rebuilds recent eBay SALE fee rows from the authoritative Finances API.
 *
 * Why this exists:
 * - eBay's field is `orderLineItemId`, not `lineItemId`.
 * - SALE responses can expose fees through `orderLineItems[].fees`,
 *   line-level `totalFeeAmount`, or top-level `totalFeeAmount`.
 *
 * The older sync only read `lineItemId` and the detailed fees array, which
 * could leave a perfectly valid sale showing "Marketplace selling fees −$0.00".
 */
export async function reconcileRecentEbaySellingFees(
  env: EbayEnv,
  workspaceId: string,
  days = 90
) {
  const db = env.DB;
  const accessToken = await getAccessToken(env, workspaceId);
  const transactions = await fetchRecentSales(accessToken, days);
  const now = new Date().toISOString();

  const statements: D1PreparedStatement[] = [];
  let feeRowsWritten = 0;
  let transactionsWithFees = 0;

  for (const transaction of transactions) {
    if (!transaction.transactionId) continue;

    const feeRows = feeRowsForTransaction(workspaceId, transaction, now);

    if (!feeRows.length) {
      // Do not erase an existing good fee record merely because eBay omitted
      // fee detail from one response.
      continue;
    }

    transactionsWithFees += 1;

    // The previous importer generated synthetic selling-fee rows with the
    // parent SALE transaction id in reference_id. Rebuild those rows
    // atomically/deterministically so we never double-count old + corrected
    // fee data.
    statements.push(
      db.prepare(`
        DELETE FROM financial_transactions
        WHERE workspace_id = ?
          AND source = 'ebay_api'
          AND category = 'selling_fee'
          AND reference_id = ?
      `).bind(workspaceId, transaction.transactionId)
    );

    for (const fee of feeRows) {
      feeRowsWritten += 1;

      statements.push(
        db.prepare(`
          INSERT INTO financial_transactions (
            workspace_id, id, ebay_transaction_id, ebay_order_id,
            ebay_line_item_id, transaction_type, amount_cents, currency,
            transaction_date, fee_type, booking_entry, category, source,
            description, reference_id, updated_at
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
            booking_entry = 'DEBIT',
            category = 'selling_fee',
            source = 'ebay_api',
            description = excluded.description,
            reference_id = excluded.reference_id,
            updated_at = excluded.updated_at
        `).bind(
          workspaceId,
          fee.id,
          fee.ebayTransactionId,
          fee.orderId,
          fee.lineItemId,
          fee.amountCents,
          fee.currency,
          fee.transactionDate,
          fee.feeType,
          fee.description,
          fee.referenceId,
          now
        )
      );
    }
  }

  await runStatements(db, statements);

  return {
    saleTransactionsChecked: transactions.length,
    transactionsWithFees,
    feeRowsWritten
  };
}
