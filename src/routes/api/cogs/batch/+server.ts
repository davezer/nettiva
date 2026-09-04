import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { currentWorkspaceId } from '$lib/server/workspace';

type RawUpdate = {
  inventoryItemId?: unknown;
  purchaseCostCents?: unknown;
};

type BatchBody = {
  updates?: unknown;
};

const MAX_UPDATES = 250;

function chunk<T>(values: T[], size: number) {
  const groups: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    groups.push(values.slice(index, index + size));
  }
  return groups;
}

export const POST: RequestHandler = async ({ platform, locals, request }) => {
  if (!platform) {
    return json({ error: 'Cloudflare runtime is unavailable.' }, { status: 503 });
  }

  const workspaceId = currentWorkspaceId(locals);
  const body = await request.json().catch(() => null) as BatchBody | null;

  if (!body || !Array.isArray(body.updates) || body.updates.length === 0) {
    return json({ error: 'Choose at least one COGS update.' }, { status: 400 });
  }

  if (body.updates.length > MAX_UPDATES) {
    return json({ error: `Save at most ${MAX_UPDATES} COGS updates at once.` }, { status: 413 });
  }

  const normalized = new Map<string, number>();

  for (const raw of body.updates as RawUpdate[]) {
    if (
      !raw ||
      typeof raw.inventoryItemId !== 'string' ||
      !raw.inventoryItemId.trim() ||
      raw.inventoryItemId.length > 300
    ) {
      return json({ error: 'A COGS update has an invalid inventory item.' }, { status: 400 });
    }

    if (
      !Number.isInteger(raw.purchaseCostCents) ||
      Number(raw.purchaseCostCents) < 0 ||
      Number(raw.purchaseCostCents) > 100_000_000
    ) {
      return json({ error: 'A COGS update has an invalid purchase cost.' }, { status: 400 });
    }

    const id = raw.inventoryItemId.trim();
    const cents = Number(raw.purchaseCostCents);
    const existing = normalized.get(id);

    if (existing !== undefined && existing !== cents) {
      return json({
        error: 'The same inventory item was submitted with two different purchase costs.'
      }, { status: 409 });
    }

    normalized.set(id, cents);
  }

  const updates = [...normalized.entries()].map(([inventoryItemId, purchaseCostCents]) => ({
    inventoryItemId,
    purchaseCostCents
  }));

  // Fail closed before writing: every submitted inventory item must belong to
  // this workspace, still have missing COGS, and actually be attached to a sale.
  const eligible = new Set<string>();

  for (const group of chunk(updates, 50)) {
    const placeholders = group.map(() => '?').join(', ');
    const result = await platform.env.DB.prepare(`
      SELECT i.id
      FROM inventory_items i
      WHERE i.workspace_id = ?
        AND i.id IN (${placeholders})
        AND i.purchase_cost_cents IS NULL
        AND EXISTS (
          SELECT 1
          FROM order_items oi
          WHERE oi.workspace_id = i.workspace_id
            AND oi.inventory_item_id = i.id
        )
    `).bind(
      workspaceId,
      ...group.map((update) => update.inventoryItemId)
    ).all<{ id: string }>();

    for (const row of result.results) eligible.add(row.id);
  }

  if (eligible.size !== updates.length) {
    return json({
      error: 'One or more selected items no longer need COGS. Refresh the COGS Desk and try again.'
    }, { status: 409 });
  }

  const now = new Date().toISOString();
  const statements = updates.map((update) =>
    platform.env.DB.prepare(`
      UPDATE inventory_items
      SET purchase_cost_cents = ?, updated_at = ?
      WHERE workspace_id = ?
        AND id = ?
        AND purchase_cost_cents IS NULL
    `).bind(
      update.purchaseCostCents,
      now,
      workspaceId,
      update.inventoryItemId
    )
  );

  const results = await platform.env.DB.batch(statements);
  const changed = results.reduce(
    (sum, result) => sum + Number(result.meta.changes ?? 0),
    0
  );

  if (changed !== updates.length) {
    return json({
      error: 'The COGS batch changed while it was being saved. Refresh before continuing.'
    }, { status: 409 });
  }

  return json({
    ok: true,
    updated: changed,
    inventoryItemIds: updates.map((update) => update.inventoryItemId)
  });
};
