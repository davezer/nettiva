import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  encryptToken,
  exchangeAuthorizationCode,
  getEbayConfig,
  getEbaySellerIdentity,
  probeInventoryApi
} from '$lib/server/ebay-auth';
import { currentWorkspaceId, workspaceEntityId } from '$lib/server/workspace';

export const GET: RequestHandler = async ({ platform, cookies, url, locals }) => {
  if (!platform) redirect(303, '/integrations/ebay?ebay=runtime-error');

  const workspaceId = currentWorkspaceId(locals);
  const oauthError = url.searchParams.get('error');
  if (oauthError) {
    cookies.delete('ebay_oauth_state', { path: '/' });
    cookies.delete('ebay_oauth_workspace', { path: '/' });
    redirect(303, `/integrations/ebay?ebay=${oauthError === 'access_denied' ? 'declined' : 'connect-error'}`);
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const expectedState = cookies.get('ebay_oauth_state');
  const expectedWorkspace = cookies.get('ebay_oauth_workspace');

  if (!code || !state || !expectedState || state !== expectedState || expectedWorkspace !== workspaceId) {
    cookies.delete('ebay_oauth_state', { path: '/' });
    cookies.delete('ebay_oauth_workspace', { path: '/' });
    redirect(303, '/integrations/ebay?ebay=state-error');
  }

  try {
    const config = getEbayConfig(platform.env);
    const token = await exchangeAuthorizationCode(platform.env, code);
    if (!token.refresh_token) throw new Error('eBay did not return a refresh token.');

    const [identity, inventoryApiVersion] = await Promise.all([
      getEbaySellerIdentity(token.access_token),
      probeInventoryApi(token.access_token)
    ]);

    const now = new Date().toISOString();
    const accessEncrypted = await encryptToken(token.access_token, config.encryptionKey);
    const refreshEncrypted = await encryptToken(token.refresh_token, config.encryptionKey);
    const existing = await platform.env.DB.prepare(`
      SELECT id FROM ebay_accounts WHERE workspace_id = ? LIMIT 1
    `).bind(workspaceId).first<{ id: string }>();
    const accountId = existing?.id ?? workspaceEntityId(workspaceId, 'primary');

    await platform.env.DB.prepare(`
      INSERT INTO ebay_accounts (
        id, workspace_id, access_token_encrypted, refresh_token_encrypted,
        access_token_expires_at, refresh_token_expires_at, scopes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        access_token_encrypted = excluded.access_token_encrypted,
        refresh_token_encrypted = excluded.refresh_token_encrypted,
        access_token_expires_at = excluded.access_token_expires_at,
        refresh_token_expires_at = excluded.refresh_token_expires_at,
        scopes = excluded.scopes,
        updated_at = excluded.updated_at
    `).bind(
      accountId,
      workspaceId,
      accessEncrypted,
      refreshEncrypted,
      Date.now() + token.expires_in * 1000,
      token.refresh_token_expires_in ? Date.now() + token.refresh_token_expires_in * 1000 : null,
      token.scope?.trim() || '',
      now,
      now
    ).run();

    await platform.env.DB.prepare(`
      UPDATE marketplace_accounts
      SET display_name = ?, status = 'connected', connection_method = 'oauth',
          connected_at = COALESCE(connected_at, ?), metadata_json = ?, updated_at = ?
      WHERE workspace_id = ? AND provider = 'ebay' AND external_account_id = 'primary'
    `).bind(
      identity.userId || 'eBay',
      now,
      JSON.stringify({
        userId: identity.userId,
        eiasToken: identity.eiasToken,
        storeName: identity.storeName,
        qualifiesForSelling: identity.sellerRegistrationCompleted,
        inventoryApiVersion,
        lastHealthCheckAt: now,
        lastHealthError: null
      }),
      now,
      workspaceId
    ).run();

    cookies.delete('ebay_oauth_state', { path: '/' });
    cookies.delete('ebay_oauth_workspace', { path: '/' });
  } catch (error) {
    cookies.delete('ebay_oauth_state', { path: '/' });
    cookies.delete('ebay_oauth_workspace', { path: '/' });
    console.error('eBay connect failed', error);
    redirect(303, '/integrations/ebay?ebay=connect-error');
  }

  redirect(303, '/integrations/ebay?ebay=connected');
};
