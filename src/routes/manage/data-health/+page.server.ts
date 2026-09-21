import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { loadIntegrityReport } from '$lib/server/reporting';
import { currentWorkspaceId } from '$lib/server/workspace';

export const load: PageServerLoad = async ({ platform, locals, parent }) => {
  const { shell } = await parent();
  if (!platform || !shell) throw error(503, 'Sellquity data-health checks are unavailable.');

  return {
    shell,
    report: await loadIntegrityReport(platform.env.DB, currentWorkspaceId(locals))
  };
};
