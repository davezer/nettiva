import type { PageServerLoad } from './$types';
import { loadOrganizedDashboard } from '$lib/server/organized-dashboard';

export const load: PageServerLoad = async ({ platform, locals, parent }) => {
  const { shell } = await parent();
  return loadOrganizedDashboard(platform, locals, {
    includeInventory: true,
    includeSales: true,
    includeTransactions: false,
    includeCoverage: false,
    includeHealth: false
  }, shell);
};
