import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  BUILT_IN_INVENTORY_CATEGORIES
} from '$lib/inventory-categories';
import {
  loadCustomInventoryCategories
} from '$lib/server/inventory-categories';
import { currentWorkspaceId } from '$lib/server/workspace';

type CategoryInput = {
  label?: unknown;
  prefix?: unknown;
  id?: unknown;
};

function clean(value: unknown, max: number) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function normalizedPrefix(value: unknown) {
  const prefix = clean(value, 8)?.toUpperCase() ?? null;
  return prefix && /^[A-Z0-9]{2,8}$/.test(prefix) ? prefix : null;
}

export const GET: RequestHandler = async ({ platform, locals }) => {
  if (!platform) {
    return json({ error: 'Cloudflare runtime is unavailable.' }, { status: 503 });
  }

  const workspaceId = currentWorkspaceId(locals);
  const customCategories = await loadCustomInventoryCategories(platform.env.DB, workspaceId);

  return json({
    builtInCategories: BUILT_IN_INVENTORY_CATEGORIES,
    customCategories
  });
};

export const POST: RequestHandler = async ({ platform, request, locals }) => {
  if (!platform) {
    return json({ error: 'Cloudflare runtime is unavailable.' }, { status: 503 });
  }

  const workspaceId = currentWorkspaceId(locals);
  const body = await request.json().catch(() => null) as CategoryInput | null;
  const label = clean(body?.label, 60);
  const prefix = normalizedPrefix(body?.prefix);

  if (!label || label.length < 2) {
    return json({ error: 'Category name must be at least 2 characters.' }, { status: 400 });
  }

  if (!prefix) {
    return json({ error: 'Default SKU prefix must be 2–8 letters or numbers.' }, { status: 400 });
  }

  const labelConflict = BUILT_IN_INVENTORY_CATEGORIES.some(
    (category) => category.label.toLowerCase() === label.toLowerCase()
  );
  const prefixConflict = BUILT_IN_INVENTORY_CATEGORIES.some(
    (category) => category.prefix.toLowerCase() === prefix.toLowerCase()
  );

  if (labelConflict) {
    return json({ error: 'That category already exists as a Sellquity built-in.' }, { status: 409 });
  }

  if (prefixConflict) {
    return json({
      error: `Prefix ${prefix} is already the default for a built-in category. Choose another default.`
    }, { status: 409 });
  }

  const existing = await platform.env.DB.prepare(`
    SELECT id
    FROM custom_inventory_categories
    WHERE workspace_id = ?
      AND (LOWER(label) = LOWER(?) OR LOWER(sku_prefix) = LOWER(?))
    LIMIT 1
  `).bind(workspaceId, label, prefix).first<{ id: string }>();

  if (existing) {
    return json({
      error: 'A custom category with that name or default SKU prefix already exists.'
    }, { status: 409 });
  }

  const id = `custom_${crypto.randomUUID().replaceAll('-', '')}`;
  const now = new Date().toISOString();

  await platform.env.DB.prepare(`
    INSERT INTO custom_inventory_categories (
      workspace_id,
      id,
      label,
      sku_prefix,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    workspaceId,
    id,
    label,
    prefix,
    now,
    now
  ).run();

  return json({
    ok: true,
    category: {
      value: id,
      label,
      prefix,
      custom: true
    }
  }, { status: 201 });
};

export const DELETE: RequestHandler = async ({ platform, request, locals }) => {
  if (!platform) {
    return json({ error: 'Cloudflare runtime is unavailable.' }, { status: 503 });
  }

  const workspaceId = currentWorkspaceId(locals);
  const body = await request.json().catch(() => null) as CategoryInput | null;
  const id = clean(body?.id, 40);

  if (!id || !id.startsWith('custom_')) {
    return json({ error: 'Choose a custom category to remove.' }, { status: 400 });
  }

  const category = await platform.env.DB.prepare(`
    SELECT id, label, sku_prefix AS prefix
    FROM custom_inventory_categories
    WHERE workspace_id = ?
      AND id = ?
    LIMIT 1
  `).bind(workspaceId, id).first<{ id: string; label: string; prefix: string }>();

  if (!category) {
    return json({ error: 'That custom category no longer exists.' }, { status: 404 });
  }

  const usage = await platform.env.DB.prepare(`
    SELECT COUNT(*) AS count
    FROM inventory_items
    WHERE workspace_id = ?
      AND inventory_category = ?
  `).bind(workspaceId, id).first<{ count: number }>();

  const count = Number(usage?.count ?? 0);
  if (count > 0) {
    return json({
      error:
        `${count} inventory item${count === 1 ? ' uses' : 's use'} ${category.label}. ` +
        'Move those items to another category before deleting it.'
    }, { status: 409 });
  }

  await platform.env.DB.prepare(`
    DELETE FROM custom_inventory_categories
    WHERE workspace_id = ?
      AND id = ?
  `).bind(workspaceId, id).run();

  // Deliberately leave sku_sequences alone. Sellquity never recycles SKU numbers.
  return json({ ok: true, id });
};
