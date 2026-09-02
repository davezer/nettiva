import type { PageServerLoad } from './$types';
import { demoData } from '$lib/demo';
import type {
  AccountingTransactionRow,
  DashboardData,
  InventoryRow,
  SaleRow,
  SkuReservationRow,
  SkuSequenceRow
} from '$lib/types';

type AccountRow = { lastSyncedAt: string | null };
type WorkspaceRow = {
  inventoryCount: number;
  orderCount: number;
  transactionCount: number;
  ebayFinancialCount: number;
  unallocatedNetCents: number;
};
type InventoryDbRow = Omit<InventoryRow, 'ageDays'>;
type SaleDbRow = {
  id: string;
  inventoryItemId: string | null;
  ebayOrderId: string;
  ebayLineItemId: string;
  ebayItemId: string | null;
  title: string;
  soldAt: string;
  salePriceCents: number;
  shippingChargedCents: number;
  cogsCents: number | null;
  sellingFeesCents: number;
  shippingLabelCents: number;
  refundsCents: number;
  disputesCents: number;
  otherAdjustmentsCents: number;
  pnlAdjustmentsCents: number;
};
type TransactionDbRow = AccountingTransactionRow;

export const load: PageServerLoad = async ({ platform }) => {
  const db = platform?.env.DB;
  if (!db) return demoData;

  try {
    const account = await db.prepare(
      'SELECT last_synced_at AS lastSyncedAt FROM ebay_accounts ORDER BY created_at LIMIT 1'
    ).first<AccountRow>();

    const workspace = await db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM inventory_items) AS inventoryCount,
        (SELECT COUNT(*) FROM orders) AS orderCount,
        (SELECT COUNT(*) FROM financial_transactions) AS transactionCount,
        (
          SELECT COUNT(*)
          FROM financial_transactions
          WHERE source <> 'manual'
            AND category IN (
              'selling_fee', 'shipping_label', 'refund', 'dispute',
              'other_fee', 'adjustment', 'withheld_tax', 'purchase',
              'business_expense'
            )
        ) AS ebayFinancialCount,
        COALESCE((
          SELECT SUM(amount_cents)
          FROM financial_transactions
          WHERE ebay_order_id IS NULL
            AND category IN (
              'selling_fee', 'shipping_label', 'refund', 'dispute',
              'other_fee', 'adjustment', 'withheld_tax', 'purchase'
            )
        ), 0) AS unallocatedNetCents
    `).first<WorkspaceRow>();

    const hasWorkspaceData = Boolean(
      (workspace?.inventoryCount ?? 0) ||
      (workspace?.orderCount ?? 0) ||
      (workspace?.transactionCount ?? 0)
    );

    if (!account && !hasWorkspaceData) return demoData;

    const [inventoryResult, salesResult, transactionResult, reservationResult, sequenceResult] = await db.batch([
      db.prepare(`
        SELECT i.id, i.title, i.sku, i.ebay_item_id AS ebayItemId,
          i.image_url AS imageUrl, i.condition_name AS conditionName,
          i.purchased_at AS purchasedAt, i.inventory_category AS category,
          i.purchase_cost_cents AS costCents,
          i.source, i.storage_location AS location, i.status,
          l.price_cents AS listPriceCents, l.listed_at AS listedAt
        FROM inventory_items i
        LEFT JOIN listings l ON l.inventory_item_id = i.id AND l.status IN ('active', 'scheduled')
        ORDER BY CASE i.status WHEN 'active' THEN 0 WHEN 'scheduled' THEN 1 WHEN 'unlisted' THEN 2 ELSE 3 END,
          COALESCE(l.listed_at, i.created_at) DESC
        LIMIT 1000
      `),
      db.prepare(`
        SELECT
          oi.id,
          oi.inventory_item_id AS inventoryItemId,
          o.ebay_order_id AS ebayOrderId,
          oi.ebay_line_item_id AS ebayLineItemId,
          oi.ebay_item_id AS ebayItemId,
          oi.title,
          oi.sold_at AS soldAt,
          oi.sale_price_cents AS salePriceCents,
          oi.shipping_charged_cents AS shippingChargedCents,
          i.purchase_cost_cents AS cogsCents,
          COALESCE(SUM(CASE
            WHEN ft.category = 'selling_fee' AND ft.amount_cents < 0
            THEN -ft.amount_cents ELSE 0 END), 0) AS sellingFeesCents,
          COALESCE(SUM(CASE
            WHEN ft.category = 'shipping_label' AND ft.amount_cents < 0
            THEN -ft.amount_cents ELSE 0 END), 0) AS shippingLabelCents,
          COALESCE(SUM(CASE
            WHEN ft.category = 'refund' AND ft.amount_cents < 0
            THEN -ft.amount_cents ELSE 0 END), 0) AS refundsCents,
          COALESCE(SUM(CASE
            WHEN ft.category = 'dispute' AND ft.amount_cents < 0
            THEN -ft.amount_cents ELSE 0 END), 0) AS disputesCents,
          COALESCE(SUM(CASE
            WHEN ft.category IN ('other_fee', 'adjustment', 'withheld_tax', 'purchase')
            THEN ft.amount_cents ELSE 0 END), 0) AS otherAdjustmentsCents,
          COALESCE(SUM(CASE
            WHEN ft.category IN (
              'selling_fee', 'shipping_label', 'refund', 'dispute',
              'other_fee', 'adjustment', 'withheld_tax', 'purchase'
            )
            THEN ft.amount_cents ELSE 0 END), 0) AS pnlAdjustmentsCents
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        LEFT JOIN inventory_items i ON i.id = oi.inventory_item_id
        LEFT JOIN financial_transactions ft
          ON (
            ft.ebay_line_item_id = oi.ebay_line_item_id
            OR (
              ft.ebay_line_item_id IS NULL
              AND ft.ebay_order_id = o.ebay_order_id
              AND (SELECT COUNT(*) FROM order_items oi2 WHERE oi2.order_id = o.id) = 1
            )
          )
        GROUP BY oi.id
        ORDER BY oi.sold_at DESC
        LIMIT 1000
      `),
      db.prepare(`
        SELECT
          id,
          transaction_date AS transactionDate,
          category,
          transaction_type AS transactionType,
          amount_cents AS amountCents,
          currency,
          ebay_order_id AS ebayOrderId,
          ebay_line_item_id AS ebayLineItemId,
          fee_type AS feeType,
          description,
          source,
          payout_id AS payoutId,
          reference_id AS referenceId,
          expense_category AS expenseCategory,
          memo
        FROM financial_transactions
        ORDER BY transaction_date DESC
        LIMIT 2500
      `),
      db.prepare(`
        SELECT id, sku, prefix, sequence_number AS sequenceNumber, source, status, title,
          ebay_item_id AS ebayItemId, inventory_item_id AS inventoryItemId, reserved_at AS reservedAt
        FROM sku_reservations
        ORDER BY sequence_number DESC, reserved_at DESC
        LIMIT 1000
      `),
      db.prepare(`
        SELECT prefix, last_number AS lastNumber
        FROM sku_sequences
        ORDER BY prefix
      `)
    ]);

    const now = Date.now();
    const inventory = (inventoryResult.results as unknown as InventoryDbRow[]).map((row) => ({
      ...row,
      status: row.status as InventoryRow['status'],
      ageDays: row.listedAt
        ? Math.max(0, Math.floor((now - Date.parse(row.listedAt)) / 86_400_000))
        : 0
    }));

    const sales: SaleRow[] = (salesResult.results as unknown as SaleDbRow[]).map((row) => {
      const gross = Number(row.salePriceCents) + Number(row.shippingChargedCents);
      const pnlAdjustmentsCents = Number(row.pnlAdjustmentsCents ?? 0);
      const cogs = row.cogsCents == null ? null : Number(row.cogsCents);
      const netProfitCents = gross + pnlAdjustmentsCents - (cogs ?? 0);

      return {
        ...row,
        salePriceCents: Number(row.salePriceCents),
        shippingChargedCents: Number(row.shippingChargedCents),
        sellingFeesCents: Number(row.sellingFeesCents ?? 0),
        shippingLabelCents: Number(row.shippingLabelCents ?? 0),
        refundsCents: Number(row.refundsCents ?? 0),
        disputesCents: Number(row.disputesCents ?? 0),
        otherAdjustmentsCents: Number(row.otherAdjustmentsCents ?? 0),
        pnlAdjustmentsCents,
        costsAndFeesCents: Math.max(0, -pnlAdjustmentsCents),
        cogsCents: cogs,
        netProfitCents,
        margin: gross ? (netProfitCents / gross) * 100 : 0,
        roi: cogs && cogs > 0 ? (netProfitCents / cogs) * 100 : null
      };
    });

    const transactions = (transactionResult.results as unknown as TransactionDbRow[]).map((row) => ({
      ...row,
      amountCents: Number(row.amountCents ?? 0)
    }));

    const skuReservations = (reservationResult.results as unknown as SkuReservationRow[]).map((row) => ({
      ...row, sequenceNumber: Number(row.sequenceNumber)
    }));
    const skuSequences = (sequenceResult.results as unknown as SkuSequenceRow[]).map((row) => ({
      ...row, lastNumber: Number(row.lastNumber)
    }));

    const data: DashboardData = {
      isDemo: false,
      connected: Boolean(account),
      hasImportedData: hasWorkspaceData,
      financialsComplete: (workspace?.ebayFinancialCount ?? 0) > 0,
      lastSyncedAt: account?.lastSyncedAt ?? null,
      inventory,
      sales,
      transactions,
      skuReservations,
      skuSequences,
      unallocatedNetCents: Number(workspace?.unallocatedNetCents ?? 0)
    };

    return data;
  } catch (error) {
    console.error('Nettiva dashboard load failed', error);
    return demoData;
  }
};
