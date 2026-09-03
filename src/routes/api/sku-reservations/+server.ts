import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { extractSkus, observeSku } from '$lib/server/sku-control';
import { currentWorkspaceId } from '$lib/server/workspace';

type ReservationInput = { text?: unknown };

export const POST: RequestHandler = async ({ platform, request, locals }) => {
  if (!platform) {
    return json({ error: 'Cloudflare runtime is unavailable.' }, { status: 503 });
  }

  const workspaceId = currentWorkspaceId(locals);

  try {
    const body = await request.json().catch(() => null) as ReservationInput | null;
    const text = typeof body?.text === 'string' ? body.text : '';
    const parsed = extractSkus(text);

    if (!parsed.length) {
      return json({
        error: 'No SKUs found. Paste labels such as AFG-0014, MOV-0003, or ELC-0002.'
      }, { status: 400 });
    }

    const now = new Date().toISOString();
    let reserved = 0;
    let alreadyKnown = 0;

    for (const sku of parsed) {
      // Permanently advance the prefix even if this exact SKU already exists elsewhere.
      await observeSku(platform.env.DB, workspaceId, sku.sku);

      const inventory = await platform.env.DB.prepare(`
        SELECT id
        FROM inventory_items
        WHERE workspace_id = ?
          AND sku IS NOT NULL
          AND LOWER(TRIM(sku)) = LOWER(TRIM(?))
        LIMIT 1
      `).bind(workspaceId, sku.sku).first<{ id: string }>();

      if (inventory) {
        alreadyKnown += 1;
        continue;
      }

      const result = await platform.env.DB.prepare(`
        INSERT OR IGNORE INTO sku_reservations (
          id, workspace_id, sku, prefix, sequence_number, source, status, reserved_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, 'manual_bootstrap', 'reserved', ?, ?)
      `).bind(
        `reserve:${workspaceId}:${sku.sku.toLowerCase()}`,
        workspaceId,
        sku.sku,
        sku.prefix,
        sku.sequence,
        now,
        now
      ).run();

      if (Number(result.meta.changes ?? 0) > 0) {
        reserved += 1;
      } else {
        alreadyKnown += 1;
      }
    }

    return json({
      ok: true,
      found: parsed.length,
      reserved,
      alreadyKnown
    });
  } catch (error) {
    console.error('SKU reservation failed', error);

    const message = error instanceof Error ? error.message : String(error);

    return json({
      error: `SKU reservation failed: ${message}`
    }, { status: 500 });
  }
};
