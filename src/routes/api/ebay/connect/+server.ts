import { json, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { dev } from '$app/environment';
import { EBAY_SCOPES, getEbayConfig } from '$lib/server/ebay-auth';
import { currentWorkspaceId } from '$lib/server/workspace';

export const GET: RequestHandler = async ({ platform, cookies, locals }) => {
  if (!platform) return json({ error: 'Cloudflare runtime is unavailable.' }, { status: 503 });

  const workspaceId = currentWorkspaceId(locals);

  let config;
  try {
    config = getEbayConfig(platform.env);
  } catch {
    return json({
      error: 'eBay credentials are not configured. Add the four EBAY_* secrets, then try again.'
    }, { status: 503 });
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

  const cookieOptions = {
    httpOnly: true,
    secure: !dev,
    sameSite: 'lax' as const,
    maxAge: 600,
    path: '/'
  };

  cookies.set('ebay_oauth_state', state, cookieOptions);
  cookies.set('ebay_oauth_workspace', workspaceId, cookieOptions);

  redirect(302, url.toString());
};
