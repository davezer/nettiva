import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { currentWorkspaceId } from '$lib/server/workspace';

type RequestBody = { confirm?: unknown };
type CountRow = { count: number | null };
type DeletionRow = { id: string; scheduledFor: string };
type AuthRow = { email: string };

function count(row: CountRow | null) {
  return Number(row?.count ?? 0);
}

export const POST: RequestHandler = async ({ platform, request, locals, url }) => {
  if (!platform || !locals.authUserId || !locals.userId || !locals.workspaceId) {
    return json({ error: 'Authentication required.' }, { status: 401 });
  }

  if (locals.workspaceRole !== 'owner') {
    return json({ error: 'Only the workspace owner can permanently delete this Sellquity account.' }, { status: 403 });
  }

  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin) {
    return json({ error: 'Invalid request origin.' }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as RequestBody | null;
  if (body?.confirm !== 'DELETE') {
    return json({ error: 'Type DELETE to permanently delete the account.' }, { status: 400 });
  }

  const db = platform.env.DB;
  const workspaceId = currentWorkspaceId(locals);

  const [deletionRequest, activeWorkspaceMembers, activeMemberships, otherCreatedWorkspaces, authUser] = await Promise.all([
    db.prepare(`
      SELECT id, scheduled_for AS scheduledFor
      FROM account_deletion_requests
      WHERE auth_user_id = ? AND status = 'requested'
      ORDER BY requested_at DESC
      LIMIT 1
    `).bind(locals.authUserId).first<DeletionRow>(),
    db.prepare(`
      SELECT COUNT(*) AS count
      FROM workspace_members
      WHERE workspace_id = ? AND status = 'active'
    `).bind(workspaceId).first<CountRow>(),
    db.prepare(`
      SELECT COUNT(*) AS count
      FROM workspace_members
      WHERE user_id = ? AND status = 'active'
    `).bind(locals.userId).first<CountRow>(),
    db.prepare(`
      SELECT COUNT(*) AS count
      FROM workspaces
      WHERE created_by_user_id = ? AND id <> ?
    `).bind(locals.userId, workspaceId).first<CountRow>(),
    db.prepare(`SELECT email FROM "user" WHERE id = ? LIMIT 1`).bind(locals.authUserId).first<AuthRow>()
  ]);

  if (!deletionRequest) {
    return json({ error: 'Request account deletion first. Sellquity uses a 7-day hold before permanent deletion.' }, { status: 409 });
  }

  const scheduledFor = Date.parse(deletionRequest.scheduledFor);
  if (!Number.isFinite(scheduledFor) || scheduledFor > Date.now()) {
    return json({
      error: `The deletion hold ends on ${new Date(deletionRequest.scheduledFor).toLocaleDateString('en-US')}. You can permanently delete the account after that date.`
    }, { status: 409 });
  }

  if (count(activeWorkspaceMembers) > 1) {
    return json({
      error: 'This workspace still has other active members. Remove or transfer those members before permanently deleting the workspace.'
    }, { status: 409 });
  }

  if (count(activeMemberships) > 1) {
    return json({
      error: 'This account still belongs to another active workspace. Leave or transfer that workspace before permanently deleting the account.'
    }, { status: 409 });
  }

  if (count(otherCreatedWorkspaces) > 0) {
    return json({
      error: 'This account is still recorded as the creator of another workspace. Transfer or remove that workspace before permanently deleting the account.'
    }, { status: 409 });
  }

  const authEmail = authUser?.email ?? locals.authEmail ?? '';

  await db.batch([
    db.prepare(`DELETE FROM marketplace_balance_entries WHERE workspace_id = ?`).bind(workspaceId),
    db.prepare(`DELETE FROM financial_transactions WHERE workspace_id = ?`).bind(workspaceId),
    db.prepare(`DELETE FROM order_items WHERE workspace_id = ?`).bind(workspaceId),
    db.prepare(`DELETE FROM listings WHERE workspace_id = ?`).bind(workspaceId),
    db.prepare(`DELETE FROM sku_reservations WHERE workspace_id = ?`).bind(workspaceId),
    db.prepare(`DELETE FROM orders WHERE workspace_id = ?`).bind(workspaceId),
    db.prepare(`DELETE FROM inventory_items WHERE workspace_id = ?`).bind(workspaceId),
    db.prepare(`DELETE FROM purchase_lots WHERE workspace_id = ?`).bind(workspaceId),
    db.prepare(`DELETE FROM inventory_category_preferences WHERE workspace_id = ?`).bind(workspaceId),
    db.prepare(`DELETE FROM custom_inventory_categories WHERE workspace_id = ?`).bind(workspaceId),
    db.prepare(`DELETE FROM sku_sequences WHERE workspace_id = ?`).bind(workspaceId),
    db.prepare(`DELETE FROM import_batches WHERE workspace_id = ?`).bind(workspaceId),
    db.prepare(`DELETE FROM sync_jobs WHERE workspace_id = ?`).bind(workspaceId),
    db.prepare(`DELETE FROM marketplace_accounts WHERE workspace_id = ?`).bind(workspaceId),
    db.prepare(`DELETE FROM ebay_accounts WHERE workspace_id = ?`).bind(workspaceId),
    db.prepare(`DELETE FROM support_requests WHERE workspace_id = ? OR app_user_id = ? OR auth_user_id = ?`).bind(workspaceId, locals.userId, locals.authUserId),
    db.prepare(`DELETE FROM account_deletion_requests WHERE auth_user_id = ?`).bind(locals.authUserId),
    db.prepare(`DELETE FROM auth_email_outbox WHERE auth_user_id = ?`).bind(locals.authUserId),
    db.prepare(`DELETE FROM workspace_members WHERE workspace_id = ? OR user_id = ?`).bind(workspaceId, locals.userId),
    db.prepare(`DELETE FROM workspaces WHERE id = ?`).bind(workspaceId),
    db.prepare(`DELETE FROM users WHERE id = ?`).bind(locals.userId),
    db.prepare(`DELETE FROM session WHERE userId = ?`).bind(locals.authUserId),
    db.prepare(`DELETE FROM account WHERE userId = ?`).bind(locals.authUserId),
    db.prepare(`DELETE FROM verification WHERE identifier = ?`).bind(authEmail),
    db.prepare(`DELETE FROM "user" WHERE id = ?`).bind(locals.authUserId)
  ]);

  return json({ ok: true, deleted: true }, {
    headers: { 'cache-control': 'no-store' }
  });
};
