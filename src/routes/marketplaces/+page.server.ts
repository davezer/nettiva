import type { PageServerLoad } from './$types';
import { currentWorkspaceId, getWorkspaceContext } from '$lib/server/workspace';
import {
  MARKETPLACE_PROVIDERS,
  marketplaceLabel,
  type MarketplaceProvider
} from '$lib/server/marketplace';

type AccountRow = {
  provider: string;
  externalAccountId: string;
  displayName: string | null;
  status: string;
  connectionMethod: string | null;
  connectedAt: string | null;
  lastSyncedAt: string | null;
};

type CountRow = {
  provider: string;
  count: number;
  cents?: number;
};

export const load: PageServerLoad = async ({ platform, locals }) => {
  if (!platform) {
    return {
      workspace: null,
      providers: MARKETPLACE_PROVIDERS.map((provider) => ({
        provider,
        label: marketplaceLabel(provider),
        connected: false,
        status: 'not_connected',
        connectionMethod: null,
        connectedAt: null,
        lastSyncedAt: null,
        activeListings: 0,
        orders: 0,
        grossCents: 0,
        transactions: 0
      }))
    };
  }

  const db = platform.env.DB;
  const workspaceId = currentWorkspaceId(locals);
  const workspace = await getWorkspaceContext(db, locals);

  const [accountResult, listingResult, orderResult, transactionResult] = await db.batch([
    db.prepare(`
      SELECT
        provider,
        external_account_id AS externalAccountId,
        display_name AS displayName,
        status,
        connection_method AS connectionMethod,
        connected_at AS connectedAt,
        last_synced_at AS lastSyncedAt
      FROM marketplace_accounts
      WHERE workspace_id = ?
      ORDER BY provider, created_at
    `).bind(workspaceId),
    db.prepare(`
      SELECT
        marketplace_provider AS provider,
        COUNT(*) AS count
      FROM listings
      WHERE workspace_id = ?
        AND status IN ('active', 'scheduled')
      GROUP BY marketplace_provider
    `).bind(workspaceId),
    db.prepare(`
      SELECT
        marketplace_provider AS provider,
        COUNT(*) AS count,
        COALESCE(SUM(gross_total_cents), 0) AS cents
      FROM orders
      WHERE workspace_id = ?
      GROUP BY marketplace_provider
    `).bind(workspaceId),
    db.prepare(`
      SELECT
        marketplace_provider AS provider,
        COUNT(*) AS count
      FROM financial_transactions
      WHERE workspace_id = ?
        AND marketplace_provider <> 'manual'
      GROUP BY marketplace_provider
    `).bind(workspaceId)
  ]);

  const accounts = accountResult.results as unknown as AccountRow[];
  const listingRows = listingResult.results as unknown as CountRow[];
  const orderRows = orderResult.results as unknown as CountRow[];
  const transactionRows = transactionResult.results as unknown as CountRow[];

  const accountByProvider = new Map(
    accounts.map((row) => [row.provider, row])
  );
  const listingByProvider = new Map(
    listingRows.map((row) => [row.provider, Number(row.count ?? 0)])
  );
  const orderByProvider = new Map(
    orderRows.map((row) => [
      row.provider,
      {
        count: Number(row.count ?? 0),
        cents: Number(row.cents ?? 0)
      }
    ])
  );
  const transactionByProvider = new Map(
    transactionRows.map((row) => [row.provider, Number(row.count ?? 0)])
  );

  return {
    workspace,
    providers: MARKETPLACE_PROVIDERS.map((provider: MarketplaceProvider) => {
      const account = accountByProvider.get(provider);
      const orders = orderByProvider.get(provider);

      return {
        provider,
        label: marketplaceLabel(provider),
        connected: account?.status === 'connected',
        status: account?.status ?? 'not_connected',
        connectionMethod: account?.connectionMethod ?? null,
        connectedAt: account?.connectedAt ?? null,
        lastSyncedAt: account?.lastSyncedAt ?? null,
        activeListings: listingByProvider.get(provider) ?? 0,
        orders: orders?.count ?? 0,
        grossCents: orders?.cents ?? 0,
        transactions: transactionByProvider.get(provider) ?? 0
      };
    })
  };
};
