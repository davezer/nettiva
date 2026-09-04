import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { currentWorkspaceId } from '$lib/server/workspace';

type Body = {
  action?: unknown;
  name?: unknown;
  countryCode?: unknown;
  currencyCode?: unknown;
  skip?: unknown;
};

function canManage(role: App.Locals['workspaceRole']) {
  return role === 'owner' || role === 'admin';
}

function cleanCode(value: unknown, length: number, fallback: string) {
  if (typeof value !== 'string') return fallback;
  const code = value.trim().toUpperCase();
  return new RegExp(`^[A-Z]{${length}}$`).test(code) ? code : fallback;
}

export const PATCH: RequestHandler = async ({ platform, request, locals }) => {
  if (!platform) {
    return json({ error: 'Cloudflare runtime is unavailable.' }, { status: 503 });
  }
  if (!canManage(locals.workspaceRole)) {
    return json({ error: 'Only workspace owners or admins can change onboarding.' }, { status: 403 });
  }

  const workspaceId = currentWorkspaceId(locals);
  const body = await request.json().catch(() => null) as Body | null;
  const action = typeof body?.action === 'string' ? body.action : '';
  const now = new Date().toISOString();

  if (action === 'restart') {
    await platform.env.DB.prepare(`
      UPDATE workspaces
      SET onboarding_step = 'workspace',
          onboarding_started_at = ?,
          onboarding_completed_at = NULL,
          ebay_connect_deferred = 0,
          updated_at = ?
      WHERE id = ? AND status = 'active'
    `).bind(now, now, workspaceId).run();

    return json({ ok: true, step: 'workspace' });
  }

  if (action === 'workspace') {
    const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 80) : '';
    if (name.length < 2) {
      return json({ error: 'Business name must be at least 2 characters.' }, { status: 400 });
    }

    const countryCode = cleanCode(body?.countryCode, 2, 'US');
    const currencyCode = cleanCode(body?.currencyCode, 3, 'USD');

    await platform.env.DB.prepare(`
      UPDATE workspaces
      SET name = ?,
          country_code = ?,
          currency_code = ?,
          onboarding_step = 'ebay',
          onboarding_started_at = COALESCE(onboarding_started_at, ?),
          updated_at = ?
      WHERE id = ? AND status = 'active'
    `).bind(name, countryCode, currencyCode, now, now, workspaceId).run();

    return json({ ok: true, step: 'ebay' });
  }

  if (action === 'ebay') {
    const skip = body?.skip === true;
    const account = await platform.env.DB.prepare(`
      SELECT id
      FROM ebay_accounts
      WHERE workspace_id = ?
      LIMIT 1
    `).bind(workspaceId).first<{ id: string }>();

    if (!skip && !account) {
      return json({ error: 'Connect eBay first, or choose “Do this later”.' }, { status: 400 });
    }

    await platform.env.DB.prepare(`
      UPDATE workspaces
      SET onboarding_step = 'inventory',
          ebay_connect_deferred = ?,
          updated_at = ?
      WHERE id = ? AND status = 'active'
    `).bind(skip ? 1 : 0, now, workspaceId).run();

    return json({ ok: true, step: 'inventory' });
  }

  if (action === 'finish') {
    await platform.env.DB.prepare(`
      UPDATE workspaces
      SET onboarding_step = 'complete',
          onboarding_completed_at = ?,
          updated_at = ?
      WHERE id = ? AND status = 'active'
    `).bind(now, now, workspaceId).run();

    return json({ ok: true, step: 'complete' });
  }

  return json({ error: 'Unknown onboarding action.' }, { status: 400 });
};
