import type { PageServerLoad } from './$types';
import { currentWorkspaceId, getWorkspaceContext } from '$lib/server/workspace';

type CogsDbRow = {
  saleId: string;
  inventoryItemId: string;
  title: string;
  sku: string | null;
  provider: 'ebay' | 'whatnot';
  orderId: string | null;
  soldAt: string;
  grossCents: number;
};

export const load: PageServerLoad = async ({ platform, locals }) => {
  if (!platform) {
    return {
      workspace: null,
      items: []
    };
  }

  const db = platform.env.DB;
  const workspaceId = currentWorkspaceId(locals);
  const workspace = await getWorkspaceContext(db, locals);

  const result = await db.prepare(`
    SELECT
      oi.id AS saleId,
      oi.inventory_item_id AS inventoryItemId,
      oi.title,
      i.sku,
      oi.marketplace_provider AS provider,
      o.external_order_id AS orderId,
      oi.sold_at AS soldAt,
      (oi.sale_price_cents + oi.shipping_charged_cents) AS grossCents
    FROM order_items oi
    JOIN orders o
      ON o.id = oi.order_id
      AND o.workspace_id = oi.workspace_id
    JOIN inventory_items i
      ON i.id = oi.inventory_item_id
      AND i.workspace_id = oi.workspace_id
    WHERE oi.workspace_id = ?
      AND i.purchase_cost_cents IS NULL
    ORDER BY oi.sold_at DESC, oi.id DESC
    LIMIT 2500
  `).bind(workspaceId).all<CogsDbRow>();

  return {
    workspace,
    items: result.results.map((row) => ({
      ...row,
      grossCents: Number(row.grossCents ?? 0),
      provider: row.provider === 'whatnot' ? 'whatnot' as const : 'ebay' as const
    }))
  };
};
