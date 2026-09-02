import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { syncEbay } from '$lib/server/ebay-sync';

export const POST: RequestHandler = async ({ platform }) => {
  if (!platform) redirect(303, '/?ebay=runtime-error');
  try {
    await syncEbay(platform.env);
  } catch (error) {
    console.error('Nettiva eBay sync failed', error);
    redirect(303, '/?ebay=sync-error');
  }
  redirect(303, '/?ebay=synced');
};
