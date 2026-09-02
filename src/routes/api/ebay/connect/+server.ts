import { json, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { EBAY_SCOPES, getEbayConfig } from '$lib/server/ebay-auth';

export const GET: RequestHandler = async ({ platform, cookies }) => {
  if (!platform) return json({ error: 'Cloudflare runtime is unavailable.' }, { status: 503 });
  let config;
  try {
    config = getEbayConfig(platform.env);
  } catch {
    return json({ error: 'eBay credentials are not configured. Add the four EBAY_* secrets, then try again.' }, { status: 503 });
  }
  const state = crypto.randomUUID();
  const url = new URL('https://auth.ebay.com/oauth2/authorize');
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: EBAY_SCOPES,
    state
  }).toString();
  cookies.set('ebay_oauth_state', state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 600,
    path: '/'
  });
  redirect(302, url.toString());
};
