import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { loadSalesPageData } from '$lib/server/reporting';
import { currentWorkspaceId } from '$lib/server/workspace';

export const load: PageServerLoad = async ({ platform, locals, parent, url }) => {
  const { shell } = await parent();
  if (!platform || !shell) throw error(503, 'Sellquity sales are unavailable.');

  return {
    shell,
    sales: await loadSalesPageData(platform.env.DB, currentWorkspaceId(locals), url.searchParams)
  };
};
