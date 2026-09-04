import type { PageServerLoad } from './$types';
import { currentWorkspaceId } from '$lib/server/workspace';

type WorkspaceRow = {
  id: string;
  name: string;
  plan: string;
  onboardingStep: 'workspace' | 'ebay' | 'inventory' | 'complete';
  countryCode: string;
  currencyCode: string;
  ebayConnectDeferred: number;
};

type CountRow = { count: number };
type AccountRow = { id: string };

export const load: PageServerLoad = async ({ platform, locals }) => {
  if (!platform) {
    return {
      workspace: null,
      connected: false,
      inventoryCount: 0,
      reservationCount: 0
    };
  }

  const workspaceId = currentWorkspaceId(locals);
  const [workspace, account, inventory, reservations] = await Promise.all([
    platform.env.DB.prepare(`
      SELECT
        id,
        name,
        plan,
        onboarding_step AS onboardingStep,
        country_code AS countryCode,
        currency_code AS currencyCode,
        ebay_connect_deferred AS ebayConnectDeferred
      FROM workspaces
      WHERE id = ? AND status = 'active'
      LIMIT 1
    `).bind(workspaceId).first<WorkspaceRow>(),
    platform.env.DB.prepare(`
      SELECT id FROM ebay_accounts WHERE workspace_id = ? LIMIT 1
    `).bind(workspaceId).first<AccountRow>(),
    platform.env.DB.prepare(`
      SELECT COUNT(*) AS count FROM inventory_items WHERE workspace_id = ?
    `).bind(workspaceId).first<CountRow>(),
    platform.env.DB.prepare(`
      SELECT COUNT(*) AS count FROM sku_reservations WHERE workspace_id = ?
    `).bind(workspaceId).first<CountRow>()
  ]);

  return {
    workspace: workspace ?? null,
    connected: Boolean(account),
    inventoryCount: Number(inventory?.count ?? 0),
    reservationCount: Number(reservations?.count ?? 0)
  };
};
