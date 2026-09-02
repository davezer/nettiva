import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

type InventoryPatch = {
  purchaseCostCents: number | null;
  source: string | null;
  storageLocation: string | null;
};

export const PATCH: RequestHandler = async ({ platform, params, request }) => {
  if (!platform) return json({ error: 'Cloudflare runtime is unavailable.' }, { status: 503 });
  const body = await request.json().catch(() => null) as InventoryPatch | null;
  const valid = body
    && (body.purchaseCostCents === null || (Number.isInteger(body.purchaseCostCents) && body.purchaseCostCents >= 0))
    && (body.source === null || (typeof body.source === 'string' && body.source.length <= 120))
    && (body.storageLocation === null || (typeof body.storageLocation === 'string' && body.storageLocation.length <= 80));
  if (!valid) return json({ error: 'Enter a valid cost, source, and location.' }, { status: 400 });

  const result = await platform.env.DB.prepare(`
    UPDATE inventory_items
    SET purchase_cost_cents = ?, source = ?, storage_location = ?, updated_at = ?
    WHERE id = ?
  `).bind(body.purchaseCostCents, body.source, body.storageLocation, new Date().toISOString(), params.id).run();
  if (!result.meta.changes) return json({ error: 'Inventory item not found.' }, { status: 404 });
  return json({ ok: true, id: params.id });
};
