import type { PageServerLoad } from './$types';
import { authEmailMode } from '$lib/server/email';

function localHost(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

export const load: PageServerLoad = async ({ platform, url }) => ({
  devMailbox: Boolean(
    platform &&
    localHost(url.hostname) &&
    authEmailMode(platform.env) === 'outbox'
  )
});
