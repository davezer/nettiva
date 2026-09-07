import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { currentWorkspaceId } from '$lib/server/workspace';

export const POST: RequestHandler = async ({ platform, locals }) => {
  if (!platform) return json({ error: 'Cloudflare runtime is unavailable.' }, { status: 503 });
  if (locals.workspaceRole === 'member') return json({ error: 'Workspace admin access is required.' }, { status: 403 });

  const workspaceId = currentWorkspaceId(locals);
  await platform.env.DB.batch([
    platform.env.DB.prepare('DELETE FROM ebay_accounts WHERE workspace_id = ?').bind(workspaceId),
    platform.env.DB.prepare(`DELETE FROM marketplace_accounts WHERE workspace_id = ? AND provider = 'ebay'`).bind(workspaceId)
  ]);

  return json({ ok: true });
};
