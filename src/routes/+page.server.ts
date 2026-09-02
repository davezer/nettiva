import type { PageServerLoad } from './$types';
import { demoData } from '$lib/demo';
import type { DashboardData, InventoryRow, SaleRow } from '$lib/types';

type AccountRow = { lastSyncedAt: string | null };
type WorkspaceRow = {
  inventoryCount: number;
  orderCount: number;
  transactionCount: number;
  unallocatedNetCents: number;
};
type InventoryDbRow = Omit<InventoryRow, 'ageDays'>;
type SaleDbRow = {
  id: string;
  title: string;
  soldAt: string;
  salePriceCents: number;
  shippingChargedCents: number;
  cogsCents: number;
  costsAndFeesCents: number;
};

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

    const [inventoryResult, salesResult] = await db.batch([
      db.prepare(`
        SELECT i.id, i.title, i.sku, i.ebay_item_id AS ebayItemId,
          i.image_url AS imageUrl, i.purchase_cost_cents AS costCents,
          i.source, i.storage_location AS location, i.status,
          l.price_cents AS listPriceCents, l.listed_at AS listedAt
        FROM inventory_items i
        LEFT JOIN listings l ON l.inventory_item_id = i.id AND l.status = 'active'
        ORDER BY CASE i.status WHEN 'active' THEN 0 WHEN 'unlisted' THEN 1 ELSE 2 END,
          COALESCE(l.listed_at, i.created_at) DESC
        LIMIT 500
      `),
      db.prepare(`
        SELECT oi.id, oi.title, oi.sold_at AS soldAt,
          oi.sale_price_cents AS salePriceCents,
          oi.shipping_charged_cents AS shippingChargedCents,
          COALESCE(i.purchase_cost_cents, 0) AS cogsCents,
          ABS(COALESCE(SUM(
            CASE
              WHEN ft.amount_cents < 0
                AND ft.category IN (
                  'selling_fee', 'shipping_label', 'refund', 'dispute',
                  'other_fee', 'adjustment', 'withheld_tax', 'purchase'
                )
              THEN ft.amount_cents
              ELSE 0
            END
          ), 0)) AS costsAndFeesCents
        FROM order_items oi
        LEFT JOIN inventory_items i ON i.id = oi.inventory_item_id
        LEFT JOIN financial_transactions ft ON ft.ebay_line_item_id = oi.ebay_line_item_id
        GROUP BY oi.id
        ORDER BY oi.sold_at DESC
        LIMIT 500
      `)
    ]);

    const now = Date.now();
    const inventory = (inventoryResult.results as unknown as InventoryDbRow[]).map((row) => ({
      ...row,
      status: row.status as InventoryRow['status'],
      ageDays: row.listedAt ? Math.max(0, Math.floor((now - Date.parse(row.listedAt)) / 86_400_000)) : 0
    }));

    const sales: SaleRow[] = (salesResult.results as unknown as SaleDbRow[]).map((row) => {
      const gross = row.salePriceCents + row.shippingChargedCents;
      const netProfitCents = gross - row.costsAndFeesCents - row.cogsCents;
      return {
        ...row,
        netProfitCents,
        margin: gross ? (netProfitCents / gross) * 100 : 0,
        roi: row.cogsCents ? (netProfitCents / row.cogsCents) * 100 : null
      };
    });

    const hasFinancialTransactions = (workspace?.transactionCount ?? 0) > 0;

    const data: DashboardData = {
      isDemo: false,
      connected: Boolean(account),
      hasImportedData: hasWorkspaceData,
      financialsComplete: hasFinancialTransactions,
      lastSyncedAt: account?.lastSyncedAt ?? null,
      inventory,
      sales,
      unallocatedNetCents: Number(workspace?.unallocatedNetCents ?? 0)
    };
    return data;
  } catch (error) {
    console.error('Nettiva dashboard load failed', error);
    return demoData;
  }
};
