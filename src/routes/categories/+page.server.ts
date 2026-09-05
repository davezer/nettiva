import type { PageServerLoad } from './$types';
import { currentWorkspaceId } from '$lib/server/workspace';
import { loadCustomInventoryCategories } from '$lib/server/inventory-categories';

type UsageRow = {
  category: string;
  count: number;
};

export const load: PageServerLoad = async ({ platform, locals }) => {
  const db = platform?.env.DB;
  if (!db) {
    return {
      customCategories: [],
      usageByCategory: {} as Record<string, number>
    };
  }

  const workspaceId = currentWorkspaceId(locals);

  const [customCategories, usageResult] = await Promise.all([
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
    customCategories,
    usageByCategory: Object.fromEntries(
      usageResult.results.map((row) => [row.category, Number(row.count ?? 0)])
    )
  };
};
