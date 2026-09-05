import type { PageServerLoad } from './$types';
import { currentWorkspaceId } from '$lib/server/workspace';

type PurchaseLotRow = {
  id: string;
  label: string;
  source: string | null;
  purchasedAt: string | null;
  purchasePriceCents: number;
  taxFeesCents: number;
  inboundShippingCents: number;
  totalCostCents: number;
  defaultLocation: string | null;
  notes: string | null;
  allocationMode: string;
  itemCount: number;
  createdAt: string;
};

type PurchaseLotItemRow = {
  id: string;
  purchaseLotId: string;
  title: string;
  sku: string | null;
  category: string;
  costCents: number | null;
  status: string;
};

export const load: PageServerLoad = async ({ platform, locals }) => {
  const db = platform?.env.DB;
  if (!db) {
    return {
      recentLots: [] as PurchaseLotRow[],
      recentLotItems: [] as PurchaseLotItemRow[]
    };
  }

  const workspaceId = currentWorkspaceId(locals);

  const [lotsResult, itemsResult] = await Promise.all([
    db.prepare(`
      SELECT
        id,
        label,
        source,
        purchased_at AS purchasedAt,
        purchase_price_cents AS purchasePriceCents,
        tax_fees_cents AS taxFeesCents,
        inbound_shipping_cents AS inboundShippingCents,
        total_cost_cents AS totalCostCents,
        default_location AS defaultLocation,
        notes,
        allocation_mode AS allocationMode,
        item_count AS itemCount,
        created_at AS createdAt
      FROM purchase_lots
      WHERE workspace_id = ?
      ORDER BY COALESCE(purchased_at, created_at) DESC, created_at DESC
      LIMIT 10
    `).bind(workspaceId).all(),
    db.prepare(`
      SELECT
        id,
        purchase_lot_id AS purchaseLotId,
        title,
        sku,
        inventory_category AS category,
        purchase_cost_cents AS costCents,
        status
      FROM inventory_items
      WHERE workspace_id = ?
        AND purchase_lot_id IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 100
    `).bind(workspaceId).all()
  ]);

  return {
    recentLots: (lotsResult.results as unknown as PurchaseLotRow[]).map((row) => ({
      ...row,
      purchasePriceCents: Number(row.purchasePriceCents ?? 0),
      taxFeesCents: Number(row.taxFeesCents ?? 0),
      inboundShippingCents: Number(row.inboundShippingCents ?? 0),
      totalCostCents: Number(row.totalCostCents ?? 0),
      itemCount: Number(row.itemCount ?? 0)
    })),
    recentLotItems: (itemsResult.results as unknown as PurchaseLotItemRow[]).map((row) => ({
      ...row,
      costCents: row.costCents == null ? null : Number(row.costCents)
    }))
  };
};
