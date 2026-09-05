import {
  builtInInventoryCategory,
  isBuiltInInventoryCategory
} from '$lib/inventory-categories';
import type {
  InventoryCategory,
  InventoryCategoryDefinition
} from '$lib/types';

type CustomCategoryRow = {
  id: string;
  label: string;
  prefix: string;
};

export async function loadCustomInventoryCategories(
  db: D1Database,
  workspaceId: string
): Promise<InventoryCategoryDefinition[]> {
  const result = await db.prepare(`
    SELECT
      id,
      label,
      sku_prefix AS prefix
    FROM custom_inventory_categories
    WHERE workspace_id = ?
    ORDER BY LOWER(label), created_at
  `).bind(workspaceId).all<CustomCategoryRow>();

  return result.results.map((row) => ({
    value: row.id as InventoryCategory,
    label: row.label,
    prefix: row.prefix,
    custom: true
  }));
}

export async function getInventoryCategoryDefinition(
  db: D1Database,
  workspaceId: string,
  value: string
): Promise<InventoryCategoryDefinition | null> {
  const builtIn = builtInInventoryCategory(value);
  if (builtIn) return builtIn;

  if (!value.startsWith('custom_')) return null;

  const row = await db.prepare(`
    SELECT
      id,
      label,
      sku_prefix AS prefix
    FROM custom_inventory_categories
    WHERE workspace_id = ?
      AND id = ?
    LIMIT 1
  `).bind(workspaceId, value).first<CustomCategoryRow>();

  return row
    ? {
        value: row.id as InventoryCategory,
        label: row.label,
        prefix: row.prefix,
        custom: true
      }
    : null;
}

export async function inventoryCategoryExists(
  db: D1Database,
  workspaceId: string,
  value: string
) {
  if (isBuiltInInventoryCategory(value)) return true;
  return Boolean(await getInventoryCategoryDefinition(db, workspaceId, value));
}
