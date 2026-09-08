import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { loadSoldDetail } from '$lib/server/organized-dashboard';

export const load: PageServerLoad = async ({ platform, locals, params, parent }) => {
  const { shell } = await parent();
  const { dashboard, sale, item, transactions } = await loadSoldDetail(platform, locals, params.id, shell);
  if (!sale) error(404, 'Sale not found.');
  return { dashboard, sale, item, transactions };
};
