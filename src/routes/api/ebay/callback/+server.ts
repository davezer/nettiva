import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { encryptToken, exchangeAuthorizationCode, getEbayConfig } from '$lib/server/ebay-auth';

export const GET: RequestHandler = async ({ platform, cookies, url }) => {
  if (!platform) redirect(303, '/?ebay=runtime-error');
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const expectedState = cookies.get('ebay_oauth_state');
  if (!code || !state || !expectedState || state !== expectedState) redirect(303, '/?ebay=state-error');

  try {
    const config = getEbayConfig(platform.env);
    const token = await exchangeAuthorizationCode(platform.env, code);
    if (!token.refresh_token) throw new Error('eBay did not return a refresh token.');
    const now = new Date().toISOString();
    const accessEncrypted = await encryptToken(token.access_token, config.encryptionKey);
    const refreshEncrypted = await encryptToken(token.refresh_token, config.encryptionKey);
    await platform.env.DB.prepare(`
      INSERT INTO ebay_accounts (
        id, access_token_encrypted, refresh_token_encrypted,
        access_token_expires_at, refresh_token_expires_at, scopes, created_at, updated_at
      ) VALUES ('primary', ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        access_token_encrypted = excluded.access_token_encrypted,
        refresh_token_encrypted = excluded.refresh_token_encrypted,
        access_token_expires_at = excluded.access_token_expires_at,
        refresh_token_expires_at = excluded.refresh_token_expires_at,
        scopes = excluded.scopes,
        updated_at = excluded.updated_at
    `).bind(
      accessEncrypted,
      refreshEncrypted,
      Date.now() + token.expires_in * 1000,
      token.refresh_token_expires_in ? Date.now() + token.refresh_token_expires_in * 1000 : null,
      token.scope,
      now,
      now
    ).run();
    cookies.delete('ebay_oauth_state', { path: '/' });
  } catch {
    redirect(303, '/?ebay=connect-error');
  }
  redirect(303, '/?ebay=connected');
};
