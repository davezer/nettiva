import { error as httpError } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { demoData } from '$lib/demo';
import { currentWorkspaceId, getWorkspaceContext } from '$lib/server/workspace';
import { loadBuiltInInventoryCategories, loadCustomInventoryCategories } from '$lib/server/inventory-categories';
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
  marketplaceFinancialCount: number;
  unallocatedNetCents: number;
};
type InventoryDbRow = Omit<InventoryRow, 'ageDays'>;
type SaleDbRow = {
  id: string;
  inventoryItemId: string | null;
  marketplaceProvider: string;
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
type TransactionDbRow = Omit<AccountingTransactionRow, 'marketplaceProvider'> & {
  marketplaceProvider: string;
};

export const load: PageServerLoad = async ({ platform, locals }) => {
  const db = platform?.env.DB;
  if (!db) return demoData;

  try {
    const workspaceId = currentWorkspaceId(locals);
    const workspaceContext = await getWorkspaceContext(db, locals);
    if (!workspaceContext) throw new Error('Workspace context is unavailable.');

    const account = await db.prepare(
      'SELECT last_synced_at AS lastSyncedAt FROM ebay_accounts WHERE workspace_id = ? ORDER BY created_at LIMIT 1'
    ).bind(workspaceId).first<AccountRow>();

    const workspace = await db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM inventory_items WHERE workspace_id = ?) AS inventoryCount,
        (SELECT COUNT(*) FROM orders WHERE workspace_id = ?) AS orderCount,
        (SELECT COUNT(*) FROM financial_transactions WHERE workspace_id = ?) AS transactionCount,
        (
          SELECT COUNT(*)
          FROM financial_transactions
          WHERE workspace_id = ?
            AND source <> 'manual'
            AND category IN (
              'selling_fee', 'shipping_label', 'refund', 'dispute',
              'other_fee', 'adjustment', 'withheld_tax', 'purchase',
              'business_expense'
            )
        ) AS marketplaceFinancialCount,
        COALESCE((
          SELECT SUM(amount_cents)
          FROM financial_transactions
          WHERE workspace_id = ?
            AND external_order_id IS NULL
            AND category IN (
              'selling_fee', 'shipping_label', 'refund', 'dispute',
              'other_fee', 'adjustment', 'withheld_tax', 'purchase'
            )
        ), 0) AS unallocatedNetCents
    `).bind(workspaceId, workspaceId, workspaceId, workspaceId, workspaceId).first<WorkspaceRow>();

    const hasWorkspaceData = Boolean(
      (workspace?.inventoryCount ?? 0) ||
      (workspace?.orderCount ?? 0) ||
      (workspace?.transactionCount ?? 0)
    );

    // A real workspace can be empty. Demo data is only used when no D1 runtime exists
    // or a load genuinely fails. This is important for future new-customer onboarding.

    const [inventoryResult, salesResult, transactionResult, reservationResult, sequenceResult] = await db.batch([
      db.prepare(`
        SELECT i.id, i.title, i.sku, i.ebay_item_id AS ebayItemId,
          i.image_url AS imageUrl, i.condition_name AS conditionName,
          i.purchased_at AS purchasedAt, i.inventory_category AS category,
          i.purchase_cost_cents AS costCents,
          i.source, i.storage_location AS location, i.status,
          l.price_cents AS listPriceCents, l.listed_at AS listedAt
        FROM inventory_items i
        LEFT JOIN listings l ON l.inventory_item_id = i.id AND l.workspace_id = ? AND l.status IN ('active', 'scheduled')
        WHERE i.workspace_id = ?
        ORDER BY CASE i.status WHEN 'active' THEN 0 WHEN 'scheduled' THEN 1 WHEN 'unlisted' THEN 2 ELSE 3 END,
          COALESCE(l.listed_at, i.created_at) DESC
        LIMIT 1000
      `).bind(workspaceId, workspaceId),
      db.prepare(`
        SELECT
          oi.id,
          oi.inventory_item_id AS inventoryItemId,
          oi.marketplace_provider AS marketplaceProvider,
          o.external_order_id AS ebayOrderId,
          oi.external_line_item_id AS ebayLineItemId,
          oi.external_item_id AS ebayItemId,
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
        JOIN orders o ON o.id = oi.order_id AND o.workspace_id = oi.workspace_id
        LEFT JOIN inventory_items i ON i.id = oi.inventory_item_id AND i.workspace_id = oi.workspace_id
        LEFT JOIN financial_transactions ft
          ON ft.workspace_id = ?
          AND ft.marketplace_provider = oi.marketplace_provider
          AND (
            ft.external_line_item_id = oi.external_line_item_id
            OR (
              ft.external_line_item_id IS NULL
              AND ft.external_order_id = o.external_order_id
              AND (SELECT COUNT(*) FROM order_items oi2 WHERE oi2.workspace_id = ? AND oi2.order_id = o.id) = 1
            )
          )
        WHERE oi.workspace_id = ?
        GROUP BY oi.id
        ORDER BY oi.sold_at DESC
        LIMIT 1000
      `).bind(workspaceId, workspaceId, workspaceId),
      db.prepare(`
        SELECT
          id,
          marketplace_provider AS marketplaceProvider,
          transaction_date AS transactionDate,
          category,
          transaction_type AS transactionType,
          amount_cents AS amountCents,
          currency,
          external_order_id AS ebayOrderId,
          external_line_item_id AS ebayLineItemId,
          fee_type AS feeType,
          description,
          source,
          payout_id AS payoutId,
          reference_id AS referenceId,
          expense_category AS expenseCategory,
          memo
        FROM financial_transactions
        WHERE workspace_id = ?
        ORDER BY transaction_date DESC
        LIMIT 2500
      `).bind(workspaceId),
      db.prepare(`
        SELECT id, sku, prefix, sequence_number AS sequenceNumber, source, status, title,
          ebay_item_id AS ebayItemId, inventory_item_id AS inventoryItemId, reserved_at AS reservedAt
        FROM sku_reservations
        WHERE workspace_id = ?
        ORDER BY sequence_number DESC, reserved_at DESC
        LIMIT 1000
      `).bind(workspaceId),
      db.prepare(`
        SELECT prefix, last_number AS lastNumber
        FROM sku_sequences
        WHERE workspace_id = ?
        ORDER BY prefix
      `).bind(workspaceId)
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
        marketplaceProvider: row.marketplaceProvider === 'whatnot' ? 'whatnot' : 'ebay',
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

    const transactions: AccountingTransactionRow[] = (
      transactionResult.results as unknown as TransactionDbRow[]
    ).map((row) => ({
      ...row,
      marketplaceProvider:
        row.marketplaceProvider === 'whatnot'
          ? 'whatnot'
          : row.marketplaceProvider === 'manual'
            ? 'manual'
            : row.marketplaceProvider === 'ebay'
              ? 'ebay'
              : 'other',
      amountCents: Number(row.amountCents ?? 0)
    }));

    const skuReservations = (reservationResult.results as unknown as SkuReservationRow[]).map((row) => ({
      ...row, sequenceNumber: Number(row.sequenceNumber)
    }));
    const skuSequences = (sequenceResult.results as unknown as SkuSequenceRow[]).map((row) => ({
      ...row, lastNumber: Number(row.lastNumber)
    }));

    const [builtInInventoryCategories, customInventoryCategories] = await Promise.all([
      loadBuiltInInventoryCategories(db, workspaceId),
      loadCustomInventoryCategories(db, workspaceId)
    ]);

    const data: DashboardData = {
      currentUser: locals.authUserId
        ? {
            name: locals.authName ?? locals.authEmail ?? 'Sellquity user',
            email: locals.authEmail ?? ''
          }
        : null,
      workspace: workspaceContext,
      isDemo: false,
      connected: Boolean(account),
      hasImportedData: hasWorkspaceData,
      financialsComplete: (workspace?.marketplaceFinancialCount ?? 0) > 0,
      lastSyncedAt: account?.lastSyncedAt ?? null,
      inventory,
      sales,
      transactions,
      skuReservations,
      skuSequences,
      builtInInventoryCategories,
      customInventoryCategories,
      unallocatedNetCents: Number(workspace?.unallocatedNetCents ?? 0)
    };

    return data;
  } catch (error) {
    console.error('Sellquity dashboard load failed', error);
    httpError(500, 'Could not load this Sellquity workspace.');
  }
};
