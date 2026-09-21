import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { loadInsightsReport, normalizePeriod } from '$lib/server/reporting';
import { currentWorkspaceId } from '$lib/server/workspace';

export const load: PageServerLoad = async ({ platform, locals, parent, url }) => {
  const { shell } = await parent();
  if (!platform || !shell) throw error(503, 'Sellquity insights are unavailable.');

  const requestedPeriod = normalizePeriod(url.searchParams.get('period'), '90d');
  const period = requestedPeriod === 'month' ? '90d' : requestedPeriod;
  return {
    shell,
    report: await loadInsightsReport(platform.env.DB, currentWorkspaceId(locals), period)
  };
};
