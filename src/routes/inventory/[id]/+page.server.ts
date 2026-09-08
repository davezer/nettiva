import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { loadInventoryDetail } from '$lib/server/organized-dashboard';

export const load: PageServerLoad = async ({ platform, locals, params, parent }) => {
  const { shell } = await parent();
  const { dashboard, item, sale } = await loadInventoryDetail(platform, locals, params.id, shell);
  if (!item) error(404, 'Inventory item not found.');
  return { dashboard, item, sale };
};
