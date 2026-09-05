import type { PageServerLoad } from './$types';
import { currentWorkspaceId } from '$lib/server/workspace';
import {
  loadBuiltInInventoryCategories,
  loadCustomInventoryCategories
} from '$lib/server/inventory-categories';
import { BUILT_IN_INVENTORY_CATEGORIES } from '$lib/inventory-categories';

type UsageRow = {
  category: string;
  count: number;
};

export const load: PageServerLoad = async ({ platform, locals }) => {
  const db = platform?.env.DB;

  if (!db) {
    return {
      builtInCategories: BUILT_IN_INVENTORY_CATEGORIES.map((category) => ({
        ...category,
        enabled: true
      })),
      customCategories: [],
      usageByCategory: {} as Record<string, number>
    };
  }

  const workspaceId = currentWorkspaceId(locals);

  const [builtInCategories, customCategories, usageResult] = await Promise.all([
    loadBuiltInInventoryCategories(db, workspaceId),
    loadCustomInventoryCategories(db, workspaceId),
    db.prepare(`
      SELECT
        inventory_category AS category,
        COUNT(*) AS count
      FROM inventory_items
      WHERE workspace_id = ?
      GROUP BY inventory_category
    `).bind(workspaceId).all<UsageRow>()
  ]);

  return {
    builtInCategories,
    customCategories,
    usageByCategory: Object.fromEntries(
      usageResult.results.map((row) => [row.category, Number(row.count ?? 0)])
    )
  };
};
