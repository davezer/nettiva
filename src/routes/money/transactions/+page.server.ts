import type { PageServerLoad } from './$types';
import { loadOrganizedDashboard } from '$lib/server/organized-dashboard';

export const load: PageServerLoad = async ({ platform, locals, parent }) => {
  const { shell } = await parent();
  return loadOrganizedDashboard(platform, locals, {
    includeInventory: false,
    includeSales: false,
    includeTransactions: true,
    includeCoverage: false,
    includeHealth: false
  }, shell);
};
