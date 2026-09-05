import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { InventoryCategory } from '$lib/types';
import { inventoryCategoryExists } from '$lib/server/inventory-categories';
import { currentWorkspaceId } from '$lib/server/workspace';

const MAX_BATCH = 250;

type BatchInventoryPatch = {
  ids?: unknown;
  purchaseCostCents?: unknown;
  source?: unknown;
  storageLocation?: unknown;
  purchasedAt?: unknown;
  conditionName?: unknown;
  category?: unknown;
};

function cleanNullable(value: unknown, max: number) {
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function normalizedPurchaseDate(value: unknown) {
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return undefined;
  return `${trimmed}T12:00:00.000Z`;
}

export const PATCH: RequestHandler = async ({ platform, request, locals }) => {
  if (!platform) {
    return json({ error: 'Cloudflare runtime is unavailable.' }, { status: 503 });
  }

  const workspaceId = currentWorkspaceId(locals);
  const body = await request.json().catch(() => null) as BatchInventoryPatch | null;

  if (!body || !Array.isArray(body.ids)) {
    return json({ error: 'Choose inventory items to update.' }, { status: 400 });
  }

  const ids = [...new Set(
    body.ids
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim())
      .filter(Boolean)
  )];

  if (!ids.length) {
    return json({ error: 'Choose at least one inventory item.' }, { status: 400 });
  }

  if (ids.length > MAX_BATCH) {
    return json({
      error: `Bulk inventory updates are limited to ${MAX_BATCH} items at a time.`
    }, { status: 400 });
  }

  const setClauses: string[] = [];
  const values: unknown[] = [];

  if (Object.hasOwn(body, 'storageLocation')) {
    const value = cleanNullable(body.storageLocation, 80);
    if (value === undefined) {
      return json({ error: 'Enter a valid storage location.' }, { status: 400 });
    }
    setClauses.push('storage_location = ?');
    values.push(value);
  }

  if (Object.hasOwn(body, 'source')) {
    const value = cleanNullable(body.source, 120);
    if (value === undefined) {
      return json({ error: 'Enter a valid source.' }, { status: 400 });
    }
    setClauses.push('source = ?');
    values.push(value);
  }

  if (Object.hasOwn(body, 'conditionName')) {
    const value = cleanNullable(body.conditionName, 80);
    if (value === undefined) {
      return json({ error: 'Enter a valid condition.' }, { status: 400 });
    }
    setClauses.push('condition_name = ?');
    values.push(value);
  }

  if (Object.hasOwn(body, 'category')) {
    const value = cleanNullable(body.category, 40) as InventoryCategory | null | undefined;
    if (
      !value ||
      !(await inventoryCategoryExists(platform.env.DB, workspaceId, value))
    ) {
      return json({ error: 'Choose a valid inventory category.' }, { status: 400 });
    }
    setClauses.push('inventory_category = ?');
    values.push(value);
  }

  if (Object.hasOwn(body, 'purchasedAt')) {
    const value = normalizedPurchaseDate(body.purchasedAt);
    if (value === undefined) {
      return json({ error: 'Choose a valid purchase date.' }, { status: 400 });
    }
    setClauses.push('purchased_at = ?');
    values.push(value);
  }

  if (Object.hasOwn(body, 'purchaseCostCents')) {
    if (
      body.purchaseCostCents !== null &&
      (!Number.isInteger(body.purchaseCostCents) || Number(body.purchaseCostCents) < 0)
    ) {
      return json({ error: 'Enter a valid purchase cost.' }, { status: 400 });
    }

    setClauses.push('purchase_cost_cents = ?');
    values.push(body.purchaseCostCents === null ? null : Number(body.purchaseCostCents));
  }

  if (!setClauses.length) {
    return json({ error: 'Choose at least one field to apply.' }, { status: 400 });
  }

  const placeholders = ids.map(() => '?').join(', ');
  const existing = await platform.env.DB.prepare(`
    SELECT id
    FROM inventory_items
    WHERE workspace_id = ?
      AND id IN (${placeholders})
  `).bind(workspaceId, ...ids).all<{ id: string }>();

  const found = new Set(existing.results.map((row) => row.id));
  const missing = ids.filter((id) => !found.has(id));

  if (missing.length) {
    return json({
      error: `${missing.length} selected inventory item${missing.length === 1 ? ' is' : 's are'} no longer available. Refresh and try again.`
    }, { status: 409 });
  }

  setClauses.push('updated_at = ?');
  values.push(new Date().toISOString());

  const result = await platform.env.DB.prepare(`
    UPDATE inventory_items
    SET ${setClauses.join(', ')}
    WHERE workspace_id = ?
      AND id IN (${placeholders})
  `).bind(
    ...values,
    workspaceId,
    ...ids
  ).run();

  return json({
    ok: true,
    selected: ids.length,
    updated: ids.length,
    changed: Number(result.meta.changes ?? 0)
  });
};
