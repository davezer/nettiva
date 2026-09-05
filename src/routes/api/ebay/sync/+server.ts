import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { syncEbay } from '$lib/server/ebay-sync';
import { currentWorkspaceId } from '$lib/server/workspace';

export const POST: RequestHandler = async ({ platform, locals }) => {
  if (!platform) redirect(303, '/?ebay=runtime-error');

  const workspaceId = currentWorkspaceId(locals);

  try {
    await syncEbay(platform.env, workspaceId);
  } catch (error) {
    console.error('Sellquity eBay sync failed', error);
    redirect(303, '/?ebay=sync-error');
  }

  redirect(303, '/?ebay=synced');
};
