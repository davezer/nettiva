import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = async ({ platform, params }) => {
  if (!platform) {
    return json({ error: 'Cloudflare runtime is unavailable.' }, { status: 503 });
  }

  const result = await platform.env.DB.prepare(`
    DELETE FROM financial_transactions
    WHERE id = ?
      AND source = 'manual'
      AND category = 'business_expense'
  `).bind(params.id).run();

  if (!result.meta.changes) {
    return json({ error: 'Manual expense not found.' }, { status: 404 });
  }

  return json({ ok: true });
};
