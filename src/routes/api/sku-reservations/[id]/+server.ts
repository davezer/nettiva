import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = async ({ platform, params }) => {
  if (!platform) return json({ error: 'Cloudflare runtime is unavailable.' }, { status: 503 });
  const result = await platform.env.DB.prepare(`
    DELETE FROM sku_reservations
    WHERE id = ? AND source = 'manual_bootstrap' AND status = 'reserved'
      AND inventory_item_id IS NULL AND ebay_item_id IS NULL
  `).bind(params.id).run();
  if (!result.meta.changes) return json({ error: 'Only unclaimed manual reservations can be removed.' }, { status: 409 });
  return json({ ok: true });
};
