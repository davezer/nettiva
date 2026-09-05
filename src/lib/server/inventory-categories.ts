import {
  BUILT_IN_INVENTORY_CATEGORIES,
  builtInInventoryCategory
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

type BuiltInPreferenceRow = {
  categoryKey: string;
  enabled: number;
  prefix: string;
};

export async function loadBuiltInInventoryCategories(
  db: D1Database,
  workspaceId: string
): Promise<InventoryCategoryDefinition[]> {
  const result = await db.prepare(`
    SELECT
      category_key AS categoryKey,
      enabled,
      sku_prefix AS prefix
    FROM inventory_category_preferences
    WHERE workspace_id = ?
  `).bind(workspaceId).all<BuiltInPreferenceRow>();

  const preferences = new Map(
    result.results.map((row) => [row.categoryKey, row] as const)
  );

  return BUILT_IN_INVENTORY_CATEGORIES.map((category) => {
    const preference = preferences.get(category.value);

    return {
      ...category,
      prefix: preference?.prefix ?? category.prefix,
      // Other is Sellquity's durable fallback for unknown imported inventory.
      enabled: category.value === 'other'
        ? true
        : preference
          ? Boolean(preference.enabled)
          : true
    };
  });
}

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
    custom: true,
    enabled: true
  }));
}

export async function getInventoryCategoryDefinition(
  db: D1Database,
  workspaceId: string,
  value: string
): Promise<InventoryCategoryDefinition | null> {
  const builtIn = builtInInventoryCategory(value);

  if (builtIn) {
    const row = await db.prepare(`
      SELECT
        enabled,
        sku_prefix AS prefix
      FROM inventory_category_preferences
      WHERE workspace_id = ?
        AND category_key = ?
      LIMIT 1
    `).bind(workspaceId, value).first<{ enabled: number; prefix: string }>();

    return {
      ...builtIn,
      prefix: row?.prefix ?? builtIn.prefix,
      enabled: value === 'other' ? true : row ? Boolean(row.enabled) : true
    };
  }

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
        custom: true,
        enabled: true
      }
    : null;
}

/**
 * True only when a category is currently available for NEW inventory.
 * Disabled built-ins still remain valid historical category identities.
 */
export async function inventoryCategoryExists(
  db: D1Database,
  workspaceId: string,
  value: string
) {
  const category = await getInventoryCategoryDefinition(db, workspaceId, value);
  return Boolean(category && category.enabled !== false);
}
