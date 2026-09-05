import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { currentWorkspaceId } from '$lib/server/workspace';

type PrepPatch = {
  listingTitleDraft?: unknown;
  targetListPriceCents?: unknown;
  listingPhotosReady?: unknown;
  listingNotes?: unknown;
};

type ExistingRow = {
  id: string;
  status: string;
};

function cleanNullable(value: unknown, max: number) {
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

export const PATCH: RequestHandler = async ({ platform, params, request, locals }) => {
  if (!platform) {
    return json({ error: 'Cloudflare runtime is unavailable.' }, { status: 503 });
  }

  const workspaceId = currentWorkspaceId(locals);
  const existing = await platform.env.DB.prepare(`
    SELECT id, status
    FROM inventory_items
    WHERE id = ? AND workspace_id = ?
  `).bind(params.id, workspaceId).first<ExistingRow>();

  if (!existing) {
    return json({ error: 'Inventory item not found.' }, { status: 404 });
  }

  if (existing.status !== 'unlisted') {
    return json({
      error: 'Only unlisted inventory can be edited from Listing Prep.'
    }, { status: 409 });
  }

  const body = await request.json().catch(() => null) as PrepPatch | null;
  if (!body) {
    return json({ error: 'Listing prep details are required.' }, { status: 400 });
  }

  const title = cleanNullable(body.listingTitleDraft, 80);
  const notes = cleanNullable(body.listingNotes, 1000);

  if (title === undefined) {
    return json({ error: 'Enter a valid eBay listing title.' }, { status: 400 });
  }

  if (notes === undefined) {
    return json({ error: 'Enter valid listing notes.' }, { status: 400 });
  }

  if (typeof body.listingPhotosReady !== 'boolean') {
    return json({ error: 'Photos-ready state is invalid.' }, { status: 400 });
  }

  let targetListPriceCents: number | null = null;
  if (body.targetListPriceCents !== null) {
    if (
      !Number.isInteger(body.targetListPriceCents) ||
      Number(body.targetListPriceCents) <= 0 ||
      Number(body.targetListPriceCents) > 100_000_000
    ) {
      return json({ error: 'Enter a valid target list price.' }, { status: 400 });
    }
    targetListPriceCents = Number(body.targetListPriceCents);
  }

  const now = new Date().toISOString();

  await platform.env.DB.prepare(`
    UPDATE inventory_items
    SET
      listing_title_draft = ?,
      target_list_price_cents = ?,
      listing_photos_ready = ?,
      listing_notes = ?,
      updated_at = ?
    WHERE id = ?
      AND workspace_id = ?
      AND status = 'unlisted'
  `).bind(
    title,
    targetListPriceCents,
    body.listingPhotosReady ? 1 : 0,
    notes,
    now,
    params.id,
    workspaceId
  ).run();

  return json({ ok: true, id: params.id });
};
