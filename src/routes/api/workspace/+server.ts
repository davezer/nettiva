import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { currentWorkspaceId } from '$lib/server/workspace';

type WorkspacePatch = { name?: unknown };

export const PATCH: RequestHandler = async ({ platform, request, locals }) => {
  if (!platform) return json({ error: 'Cloudflare runtime is unavailable.' }, { status: 503 });
  if (!['owner', 'admin'].includes(locals.workspaceRole)) {
    return json({ error: 'You do not have permission to edit this workspace.' }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as WorkspacePatch | null;
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 80) : '';
  if (name.length < 2) return json({ error: 'Workspace name must be at least 2 characters.' }, { status: 400 });

  const workspaceId = currentWorkspaceId(locals);
  const now = new Date().toISOString();
  const result = await platform.env.DB.prepare(`
    UPDATE workspaces
    SET name = ?, updated_at = ?
    WHERE id = ? AND status = 'active'
  `).bind(name, now, workspaceId).run();

  if (!result.meta.changes) return json({ error: 'Workspace not found.' }, { status: 404 });
  return json({ ok: true, id: workspaceId, name });
};
