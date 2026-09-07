import type { PageServerLoad } from './$types';
import { EBAY_SCOPE_LIST, ebayConfigurationStatus } from '$lib/server/ebay-auth';
import { currentWorkspaceId } from '$lib/server/workspace';

type AccountRow = {
  accessTokenExpiresAt: number;
  refreshTokenExpiresAt: number | null;
  scopes: string;
  createdAt: string;
};

type MarketplaceRow = {
  displayName: string | null;
  status: string;
  connectedAt: string | null;
  lastSyncedAt: string | null;
  metadataJson: string | null;
};

export const load: PageServerLoad = async ({ platform, locals, url }) => {
  const localCallbackUrl = `${url.origin}/api/ebay/callback`;

  if (!platform) {
    return {
      role: locals.workspaceRole,
      configured: false,
      config: { clientId: false, clientSecret: false, redirectUri: false, encryptionKey: false },
      callbackUrl: localCallbackUrl,
      requestedScopes: [...EBAY_SCOPE_LIST],
      connection: null
    };
  }

  const callbackUrl = ((platform.env as App.Platform['env'] & { EBAY_CALLBACK_URL?: string }).EBAY_CALLBACK_URL?.trim()) || localCallbackUrl;
  const workspaceId = currentWorkspaceId(locals);
  const [account, marketplace] = await Promise.all([
    platform.env.DB.prepare(`
      SELECT access_token_expires_at AS accessTokenExpiresAt,
             refresh_token_expires_at AS refreshTokenExpiresAt,
             scopes, created_at AS createdAt
      FROM ebay_accounts
      WHERE workspace_id = ?
      ORDER BY created_at LIMIT 1
    `).bind(workspaceId).first<AccountRow>(),
    platform.env.DB.prepare(`
      SELECT display_name AS displayName, status,
             connected_at AS connectedAt, last_synced_at AS lastSyncedAt,
             metadata_json AS metadataJson
      FROM marketplace_accounts
      WHERE workspace_id = ? AND provider = 'ebay' AND external_account_id = 'primary'
      LIMIT 1
    `).bind(workspaceId).first<MarketplaceRow>()
  ]);

  let metadata: Record<string, unknown> = {};
  if (marketplace?.metadataJson) {
    try { metadata = JSON.parse(marketplace.metadataJson) as Record<string, unknown>; } catch { metadata = {}; }
  }

  const config = ebayConfigurationStatus(platform.env);
  const configured = Object.values(config).every(Boolean);

  return {
    role: locals.workspaceRole,
    configured,
    config,
    callbackUrl,
    requestedScopes: [...EBAY_SCOPE_LIST],
    connection: account ? {
      displayName: marketplace?.displayName ?? String(metadata.userId ?? 'eBay'),
      status: marketplace?.status ?? 'connected',
      accessTokenExpiresAt: account.accessTokenExpiresAt,
      refreshTokenExpiresAt: account.refreshTokenExpiresAt,
      scopes: account.scopes.split(/\s+/).filter(Boolean),
      connectedAt: marketplace?.connectedAt ?? account.createdAt,
      lastSyncedAt: marketplace?.lastSyncedAt ?? null,
      metadata
    } : null
  };
};
