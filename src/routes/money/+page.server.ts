import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { loadMoneyReport, normalizePeriod } from '$lib/server/reporting';
import { currentWorkspaceId } from '$lib/server/workspace';

export const load: PageServerLoad = async ({ platform, locals, parent, url }) => {
  const { shell } = await parent();
  if (!platform || !shell) throw error(503, 'Sellquity money data is unavailable.');

  const requestedPeriod = normalizePeriod(url.searchParams.get('period'), 'month');
  const period = requestedPeriod === '90d' ? 'month' : requestedPeriod;
  return {
    shell,
    report: await loadMoneyReport(platform.env.DB, currentWorkspaceId(locals), period)
  };
};
