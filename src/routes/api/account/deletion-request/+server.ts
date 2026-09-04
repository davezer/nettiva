import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { currentWorkspaceId } from '$lib/server/workspace';

type RequestBody = {
  confirm?: unknown;
  reason?: unknown;
};

function cleanReason(value: unknown) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 500) : null;
}

export const POST: RequestHandler = async ({ platform, request, locals }) => {
  if (!platform || !locals.authUserId || !locals.userId) {
    return json({ error: 'Authenticated account context is unavailable.' }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as RequestBody | null;
  if (body?.confirm !== 'DELETE') {
    return json({ error: 'Type DELETE to request account deletion.' }, { status: 400 });
  }

  const workspaceId = currentWorkspaceId(locals);
  const existing = await platform.env.DB.prepare(`
    SELECT id, scheduled_for AS scheduledFor
    FROM account_deletion_requests
    WHERE auth_user_id = ? AND status = 'requested'
    LIMIT 1
  `).bind(locals.authUserId).first<{ id: string; scheduledFor: string }>();

  if (existing) {
    return json({ ok: true, id: existing.id, scheduledFor: existing.scheduledFor });
  }

  const now = new Date();
  const scheduled = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const id = `delete:${crypto.randomUUID()}`;

  await platform.env.DB.prepare(`
    INSERT INTO account_deletion_requests (
      id, auth_user_id, app_user_id, requested_workspace_id,
      status, requested_at, scheduled_for, reason
    )
    VALUES (?, ?, ?, ?, 'requested', ?, ?, ?)
  `).bind(
    id,
    locals.authUserId,
    locals.userId,
    workspaceId,
    now.toISOString(),
    scheduled.toISOString(),
    cleanReason(body?.reason)
  ).run();

  return json({ ok: true, id, scheduledFor: scheduled.toISOString() });
};

export const DELETE: RequestHandler = async ({ platform, locals }) => {
  if (!platform || !locals.authUserId) {
    return json({ error: 'Authenticated account context is unavailable.' }, { status: 401 });
  }

  const result = await platform.env.DB.prepare(`
    UPDATE account_deletion_requests
    SET status = 'canceled', canceled_at = ?
    WHERE auth_user_id = ? AND status = 'requested'
  `).bind(new Date().toISOString(), locals.authUserId).run();

  return json({ ok: true, canceled: Number(result.meta.changes ?? 0) });
};
