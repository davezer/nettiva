import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { currentWorkspaceId } from '$lib/server/workspace';

type ActionBody = {
  action?: unknown;
  amountCents?: unknown;
  date?: unknown;
  note?: unknown;
};

function clean(value: unknown, max: number) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function isoDate(value: unknown) {
  const date = clean(value, 10);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return `${date}T12:00:00.000Z`;
}

export const POST: RequestHandler = async ({ platform, params, request, locals }) => {
  if (!platform) return json({ error: 'Cloudflare runtime is unavailable.' }, { status: 503 });

  const workspaceId = currentWorkspaceId(locals);
  const body = await request.json().catch(() => null) as ActionBody | null;
  const action = clean(body?.action, 20);
  const note = clean(body?.note, 500);
  const occurredAt = isoDate(body?.date) ?? new Date().toISOString();

  const item = await platform.env.DB.prepare(`
    SELECT id, title, purchase_cost_cents AS costCents, status
    FROM inventory_items
    WHERE workspace_id = ? AND id = ?
    LIMIT 1
  `).bind(workspaceId, params.id).first<{
    id: string;
    title: string;
    costCents: number | null;
    status: string;
  }>();

  if (!item) return json({ error: 'Inventory item not found.' }, { status: 404 });
  if (item.status === 'sold') return json({ error: 'This item is already closed out.' }, { status: 409 });

  if (action === 'expense' || action === 'credit') {
    const amountCents = Number(body?.amountCents);
    if (!Number.isInteger(amountCents) || amountCents <= 0 || amountCents > 100_000_000) {
      return json({ error: 'Enter a valid amount greater than $0.' }, { status: 400 });
    }

    const currentCost = Number(item.costCents ?? 0);
    const nextCost = action === 'expense'
      ? currentCost + amountCents
      : currentCost - amountCents;

    if (nextCost < 0) {
      return json({ error: 'A credit cannot reduce the item cost below $0.' }, { status: 400 });
    }

    const adjustmentId = `cost-adjustment:${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    await platform.env.DB.batch([
      platform.env.DB.prepare(`
        INSERT INTO inventory_cost_adjustments (
          id, workspace_id, inventory_item_id, adjustment_type,
          amount_cents, occurred_at, note
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(adjustmentId, workspaceId, item.id, action, amountCents, occurredAt, note),
      platform.env.DB.prepare(`
        UPDATE inventory_items
        SET purchase_cost_cents = ?, updated_at = ?
        WHERE workspace_id = ? AND id = ?
      `).bind(nextCost, now, workspaceId, item.id)
    ]);

    return json({ ok: true, action, nextCostCents: nextCost });
  }

  if (action === 'donated' || action === 'damaged') {
    const dispositionId = `disposition:${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    await platform.env.DB.batch([
      platform.env.DB.prepare(`
        INSERT INTO inventory_dispositions (
          id, workspace_id, inventory_item_id, disposition_type, occurred_at, note
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).bind(dispositionId, workspaceId, item.id, action, occurredAt, note),
      platform.env.DB.prepare(`
        UPDATE inventory_items
        SET status = 'sold', updated_at = ?
        WHERE workspace_id = ? AND id = ?
      `).bind(now, workspaceId, item.id),
      platform.env.DB.prepare(`
        UPDATE listings
        SET status = 'ended', ended_at = COALESCE(ended_at, ?), updated_at = ?
        WHERE workspace_id = ?
          AND inventory_item_id = ?
          AND status IN ('active', 'scheduled')
      `).bind(occurredAt, now, workspaceId, item.id)
    ]);

    return json({ ok: true, action, dispositionId });
  }

  return json({ error: 'Choose a valid inventory action.' }, { status: 400 });
};
