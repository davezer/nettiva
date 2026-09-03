import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { InventoryCategory } from '$lib/types';
import { observeSku } from '$lib/server/sku-control';
import { currentWorkspaceId } from '$lib/server/workspace';

const INVENTORY_CATEGORIES = new Set<InventoryCategory>([
  'action_figures',
  'baseball_cards',
  'electronics',
  'movies',
  'video_games',
  'trading_cards',
  'collectibles',
  'other'
]);

type InventoryPatch = {
  title?: unknown;
  sku?: unknown;
  purchaseCostCents?: unknown;
  source?: unknown;
  storageLocation?: unknown;
  purchasedAt?: unknown;
  conditionName?: unknown;
  category?: unknown;
};

type InventoryDbRow = {
  id: string;
  title: string;
  sku: string | null;
  purchaseCostCents: number | null;
  source: string | null;
  storageLocation: string | null;
  purchasedAt: string | null;
  conditionName: string | null;
  category: InventoryCategory;
  ebayItemId: string | null;
  status: string;
};

function cleanNullable(value: unknown, max: number) {
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function normalizedPurchaseDate(value: unknown) {
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return undefined;
  return `${trimmed}T12:00:00.000Z`;
}

export const PATCH: RequestHandler = async ({ platform, params, request, locals }) => {
  if (!platform) return json({ error: 'Cloudflare runtime is unavailable.' }, { status: 503 });

  const workspaceId = currentWorkspaceId(locals);

  const existing = await platform.env.DB.prepare(`
    SELECT
      id, title, sku,
      purchase_cost_cents AS purchaseCostCents,
      source,
      storage_location AS storageLocation,
      purchased_at AS purchasedAt,
      condition_name AS conditionName,
      inventory_category AS category,
      ebay_item_id AS ebayItemId,
      status
    FROM inventory_items
    WHERE id = ? AND workspace_id = ?
  `).bind(params.id, workspaceId).first<InventoryDbRow>();

  if (!existing) return json({ error: 'Inventory item not found.' }, { status: 404 });

  const body = await request.json().catch(() => null) as InventoryPatch | null;
  if (!body) return json({ error: 'Inventory details are required.' }, { status: 400 });

  const titleValue = Object.hasOwn(body, 'title') ? cleanNullable(body.title, 240) : undefined;
  const skuValue = Object.hasOwn(body, 'sku') ? cleanNullable(body.sku, 100) : undefined;
  const sourceValue = Object.hasOwn(body, 'source') ? cleanNullable(body.source, 120) : undefined;
  const locationValue = Object.hasOwn(body, 'storageLocation') ? cleanNullable(body.storageLocation, 80) : undefined;
  const conditionValue = Object.hasOwn(body, 'conditionName') ? cleanNullable(body.conditionName, 80) : undefined;
  const categoryValue = Object.hasOwn(body, 'category') ? cleanNullable(body.category, 40) as InventoryCategory | null | undefined : undefined;
  const purchasedValue = Object.hasOwn(body, 'purchasedAt') ? normalizedPurchaseDate(body.purchasedAt) : undefined;

  if (titleValue === null) return json({ error: 'Item title cannot be blank.' }, { status: 400 });
  if (Object.hasOwn(body, 'title') && titleValue === undefined) return json({ error: 'Enter a valid title.' }, { status: 400 });
  if (Object.hasOwn(body, 'sku') && skuValue === undefined) return json({ error: 'Enter a valid SKU.' }, { status: 400 });
  if (Object.hasOwn(body, 'source') && sourceValue === undefined) return json({ error: 'Enter a valid source.' }, { status: 400 });
  if (Object.hasOwn(body, 'storageLocation') && locationValue === undefined) return json({ error: 'Enter a valid storage location.' }, { status: 400 });
  if (Object.hasOwn(body, 'conditionName') && conditionValue === undefined) return json({ error: 'Enter a valid condition.' }, { status: 400 });
  if (Object.hasOwn(body, 'category') && (!categoryValue || !INVENTORY_CATEGORIES.has(categoryValue))) {
    return json({ error: 'Choose a valid inventory category.' }, { status: 400 });
  }
  if (Object.hasOwn(body, 'purchasedAt') && purchasedValue === undefined) return json({ error: 'Choose a valid purchase date.' }, { status: 400 });

  let purchaseCostCents = existing.purchaseCostCents;
  if (Object.hasOwn(body, 'purchaseCostCents')) {
    if (
      body.purchaseCostCents !== null &&
      (!Number.isInteger(body.purchaseCostCents) || Number(body.purchaseCostCents) < 0)
    ) {
      return json({ error: 'Enter a valid purchase cost.' }, { status: 400 });
    }
    purchaseCostCents = body.purchaseCostCents === null ? null : Number(body.purchaseCostCents);
  }

  const title = titleValue === undefined ? existing.title : titleValue;
  const sku = skuValue === undefined ? existing.sku : skuValue;
  const source = sourceValue === undefined ? existing.source : sourceValue;
  const storageLocation = locationValue === undefined ? existing.storageLocation : locationValue;
  const conditionName = conditionValue === undefined ? existing.conditionName : conditionValue;
  const category = categoryValue === undefined ? existing.category : categoryValue;
  const purchasedAt = purchasedValue === undefined ? existing.purchasedAt : purchasedValue;

  if (sku) {
    const duplicate = await platform.env.DB.prepare(`
      SELECT sku FROM (
        SELECT sku FROM inventory_items
        WHERE workspace_id = ? AND id <> ? AND sku IS NOT NULL AND LOWER(TRIM(sku)) = LOWER(TRIM(?))
        UNION ALL
        SELECT sku FROM sku_reservations
        WHERE workspace_id = ? AND LOWER(TRIM(sku)) = LOWER(TRIM(?))
          AND (inventory_item_id IS NULL OR inventory_item_id <> ?)
      )
      LIMIT 1
    `).bind(workspaceId, params.id, sku, workspaceId, sku, params.id).first<{ sku: string }>();

    if (duplicate) {
      return json({ error: 'That SKU/custom label is already used or reserved.' }, { status: 409 });
    }

    await observeSku(platform.env.DB, workspaceId, sku);
  }

  await platform.env.DB.prepare(`
    UPDATE inventory_items
    SET
      title = ?,
      sku = ?,
      purchase_cost_cents = ?,
      source = ?,
      storage_location = ?,
      purchased_at = ?,
      condition_name = ?,
      inventory_category = ?,
      updated_at = ?
    WHERE id = ? AND workspace_id = ?
  `).bind(
    title,
    sku,
    purchaseCostCents,
    source,
    storageLocation,
    purchasedAt,
    conditionName,
    category,
    new Date().toISOString(),
    params.id,
    workspaceId
  ).run();

  return json({ ok: true, id: params.id });
};

export const DELETE: RequestHandler = async ({ platform, params, locals }) => {
  if (!platform) return json({ error: 'Cloudflare runtime is unavailable.' }, { status: 503 });

  const workspaceId = currentWorkspaceId(locals);

  const result = await platform.env.DB.prepare(`
    DELETE FROM inventory_items
    WHERE id = ?
      AND workspace_id = ?
      AND id LIKE 'manual:%'
      AND ebay_item_id IS NULL
      AND status = 'unlisted'
      AND NOT EXISTS (
        SELECT 1 FROM listings WHERE listings.workspace_id = ? AND listings.inventory_item_id = inventory_items.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM order_items WHERE order_items.workspace_id = ? AND order_items.inventory_item_id = inventory_items.id
      )
  `).bind(params.id, workspaceId, workspaceId, workspaceId).run();

  if (!result.meta.changes) {
    return json({
      error: 'Only manual, unlisted inventory with no eBay or sales history can be deleted.'
    }, { status: 409 });
  }

  return json({ ok: true });
};
