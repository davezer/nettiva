import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  BUILT_IN_INVENTORY_CATEGORIES,
  builtInInventoryCategory
} from '$lib/inventory-categories';
import {
  loadBuiltInInventoryCategories,
  loadCustomInventoryCategories
} from '$lib/server/inventory-categories';
import { currentWorkspaceId } from '$lib/server/workspace';

type CategoryInput = {
  label?: unknown;
  prefix?: unknown;
  id?: unknown;
  enabled?: unknown;
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

async function effectivePrefixConflict(
  db: D1Database,
  workspaceId: string,
  prefix: string,
  excludeBuiltInId?: string
) {
  const [builtIns, customCategories] = await Promise.all([
    loadBuiltInInventoryCategories(db, workspaceId),
    loadCustomInventoryCategories(db, workspaceId)
  ]);

  const builtInConflict = builtIns.find(
    (category) =>
      category.value !== excludeBuiltInId &&
      category.prefix.toUpperCase() === prefix.toUpperCase()
  );

  if (builtInConflict) {
    return `${prefix} is already the default for ${builtInConflict.label}.`;
  }

  const customConflict = customCategories.find(
    (category) => category.prefix.toUpperCase() === prefix.toUpperCase()
  );

  if (customConflict) {
    return `${prefix} is already the default for ${customConflict.label}.`;
  }

  return null;
}

export const GET: RequestHandler = async ({ platform, locals }) => {
  if (!platform) {
    return json({ error: 'Cloudflare runtime is unavailable.' }, { status: 503 });
  }

  const workspaceId = currentWorkspaceId(locals);
  const [builtInCategories, customCategories] = await Promise.all([
    loadBuiltInInventoryCategories(platform.env.DB, workspaceId),
    loadCustomInventoryCategories(platform.env.DB, workspaceId)
  ]);

  return json({
    builtInCategories,
    customCategories
  });
};

export const PATCH: RequestHandler = async ({ platform, request, locals }) => {
  if (!platform) {
    return json({ error: 'Cloudflare runtime is unavailable.' }, { status: 503 });
  }

  const db = platform.env.DB;
  const workspaceId = currentWorkspaceId(locals);
  const body = await request.json().catch(() => null) as CategoryInput | null;
  const id = clean(body?.id, 40);

  if (!id) {
    return json({ error: 'Choose a built-in category.' }, { status: 400 });
  }

  const base = builtInInventoryCategory(id);
  if (!base) {
    return json({ error: 'Only Sellquity built-ins use this settings endpoint.' }, { status: 400 });
  }

  const currentCategories = await loadBuiltInInventoryCategories(db, workspaceId);
  const current = currentCategories.find((category) => category.value === id) ?? {
    ...base,
    enabled: true
  };

  const prefix = body?.prefix === undefined
    ? current.prefix
    : normalizedPrefix(body.prefix);

  if (!prefix) {
    return json({
      error: 'Default SKU prefix must be 2–8 letters or numbers.'
    }, { status: 400 });
  }

  const enabled = id === 'other'
    ? true
    : typeof body?.enabled === 'boolean'
      ? body.enabled
      : current.enabled !== false;

  if (id === 'other' && body?.enabled === false) {
    return json({
      error: 'Other stays enabled as Sellquity’s safe fallback for unrecognized inventory.'
    }, { status: 409 });
  }

  const prefixConflict = await effectivePrefixConflict(db, workspaceId, prefix, id);
  if (prefixConflict) {
    return json({ error: prefixConflict }, { status: 409 });
  }

  if (!enabled && current.enabled !== false) {
    const usage = await db.prepare(`
      SELECT COUNT(*) AS count
      FROM inventory_items
      WHERE workspace_id = ?
        AND inventory_category = ?
    `).bind(workspaceId, id).first<{ count: number }>();

    const count = Number(usage?.count ?? 0);

    if (count > 0) {
      return json({
        error:
          `${count} inventory item${count === 1 ? ' is' : 's are'} still assigned to ${base.label}. ` +
          'Move them to another category before disabling this built-in.'
      }, { status: 409 });
    }
  }

  const now = new Date().toISOString();

  await db.prepare(`
    INSERT INTO inventory_category_preferences (
      workspace_id,
      category_key,
      enabled,
      sku_prefix,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(workspace_id, category_key) DO UPDATE SET
      enabled = excluded.enabled,
      sku_prefix = excluded.sku_prefix,
      updated_at = excluded.updated_at
  `).bind(
    workspaceId,
    id,
    enabled ? 1 : 0,
    prefix,
    now
  ).run();

  return json({
    ok: true,
    category: {
      ...base,
      prefix,
      enabled
    }
  });
};

export const POST: RequestHandler = async ({ platform, request, locals }) => {
  if (!platform) {
    return json({ error: 'Cloudflare runtime is unavailable.' }, { status: 503 });
  }

  const db = platform.env.DB;
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

  if (labelConflict) {
    return json({ error: 'That category already exists as a Sellquity built-in.' }, { status: 409 });
  }

  const prefixConflict = await effectivePrefixConflict(db, workspaceId, prefix);
  if (prefixConflict) {
    return json({ error: prefixConflict }, { status: 409 });
  }

  const existing = await db.prepare(`
    SELECT id
    FROM custom_inventory_categories
    WHERE workspace_id = ?
      AND LOWER(label) = LOWER(?)
    LIMIT 1
  `).bind(workspaceId, label).first<{ id: string }>();

  if (existing) {
    return json({
      error: 'A custom category with that name already exists.'
    }, { status: 409 });
  }

  const id = `custom_${crypto.randomUUID().replaceAll('-', '')}`;
  const now = new Date().toISOString();

  await db.prepare(`
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
      custom: true,
      enabled: true
    }
  }, { status: 201 });
};

export const DELETE: RequestHandler = async ({ platform, request, locals }) => {
  if (!platform) {
    return json({ error: 'Cloudflare runtime is unavailable.' }, { status: 503 });
  }

  const db = platform.env.DB;
  const workspaceId = currentWorkspaceId(locals);
  const body = await request.json().catch(() => null) as CategoryInput | null;
  const id = clean(body?.id, 40);

  if (!id || !id.startsWith('custom_')) {
    return json({ error: 'Choose a custom category to remove.' }, { status: 400 });
  }

  const category = await db.prepare(`
    SELECT id, label, sku_prefix AS prefix
    FROM custom_inventory_categories
    WHERE workspace_id = ?
      AND id = ?
    LIMIT 1
  `).bind(workspaceId, id).first<{ id: string; label: string; prefix: string }>();

  if (!category) {
    return json({ error: 'That custom category no longer exists.' }, { status: 404 });
  }

  const usage = await db.prepare(`
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

  await db.prepare(`
    DELETE FROM custom_inventory_categories
    WHERE workspace_id = ?
      AND id = ?
  `).bind(workspaceId, id).run();

  // Deliberately leave sku_sequences alone. Sellquity never recycles SKU numbers.
  return json({ ok: true, id });
};
