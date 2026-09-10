import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { BUILT_IN_INVENTORY_CATEGORIES } from '$lib/inventory-categories';
import {
  loadBuiltInInventoryCategories,
  loadCustomInventoryCategories
} from '$lib/server/inventory-categories';
import { loadInventoryDetail } from '$lib/server/organized-dashboard';
import { currentWorkspaceId } from '$lib/server/workspace';

export const load: PageServerLoad = async ({ platform, locals, params, parent }) => {
  const { shell } = await parent();

  const detailPromise = loadInventoryDetail(platform, locals, params.id, shell);
  const db = platform?.env.DB;

  const categoriesPromise = db
    ? Promise.all([
        loadBuiltInInventoryCategories(db, currentWorkspaceId(locals)),
        loadCustomInventoryCategories(db, currentWorkspaceId(locals))
      ])
    : Promise.resolve([
        BUILT_IN_INVENTORY_CATEGORIES.map((category) => ({ ...category, enabled: true })),
        []
      ] as const);

  const [
    { dashboard, item, sale },
    [builtInCategories, customCategories]
  ] = await Promise.all([detailPromise, categoriesPromise]);

  if (!item) error(404, 'Inventory item not found.');

  const categories = [...builtInCategories, ...customCategories].filter(
    (category) => category.enabled !== false || category.value === item.category
  );

  return { dashboard, item, sale, categories };
};
