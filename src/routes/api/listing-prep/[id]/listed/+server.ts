import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { currentWorkspaceId, workspaceEntityId } from '$lib/server/workspace';

type MarkListedBody = {
  ebayItemId?: unknown;
  listPriceCents?: unknown;
  listedAt?: unknown;
};

type ExistingRow = {
  id: string;
  title: string;
  sku: string | null;
  status: string;
  purchaseCostCents: number | null;
  listingTitleDraft: string | null;
  targetListPriceCents: number | null;
  listingPhotosReady: number;
};

function optionalEbayItemId(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return /^\d{8,20}$/.test(trimmed) ? trimmed : undefined;
}

function listedTimestamp(value: unknown) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return undefined;
  return `${trimmed}T12:00:00.000Z`;
}

export const POST: RequestHandler = async ({ platform, params, request, locals }) => {
  if (!platform) {
    return json({ error: 'Cloudflare runtime is unavailable.' }, { status: 503 });
  }

  const db = platform.env.DB;
  const workspaceId = currentWorkspaceId(locals);

  const existing = await db.prepare(`
    SELECT
      id,
      title,
      sku,
      status,
      purchase_cost_cents AS purchaseCostCents,
      listing_title_draft AS listingTitleDraft,
      target_list_price_cents AS targetListPriceCents,
      listing_photos_ready AS listingPhotosReady
    FROM inventory_items
    WHERE id = ? AND workspace_id = ?
  `).bind(params.id, workspaceId).first<ExistingRow>();

  if (!existing) {
    return json({ error: 'Inventory item not found.' }, { status: 404 });
  }

  if (existing.status !== 'unlisted') {
    return json({ error: 'This item is no longer in the listing-prep queue.' }, { status: 409 });
  }

  const ready = Boolean(
    existing.sku?.trim() &&
    existing.purchaseCostCents !== null &&
    existing.listingPhotosReady &&
    existing.listingTitleDraft?.trim() &&
    existing.targetListPriceCents &&
    Number(existing.targetListPriceCents) > 0
  );

  if (!ready) {
    return json({
      error: 'Finish the five listing-prep checks before marking this item listed.'
    }, { status: 409 });
  }

  const body = await request.json().catch(() => null) as MarkListedBody | null;
  if (!body) {
    return json({ error: 'Listing details are required.' }, { status: 400 });
  }

  const ebayItemId = optionalEbayItemId(body.ebayItemId);
  if (ebayItemId === undefined) {
    return json({
      error: 'eBay Item ID must be 8–20 digits, or leave it blank.'
    }, { status: 400 });
  }

  if (
    !Number.isInteger(body.listPriceCents) ||
    Number(body.listPriceCents) <= 0 ||
    Number(body.listPriceCents) > 100_000_000
  ) {
    return json({ error: 'Enter a valid eBay list price.' }, { status: 400 });
  }

  const listedAt = listedTimestamp(body.listedAt);
  if (!listedAt) {
    return json({ error: 'Choose a valid listed date.' }, { status: 400 });
  }

  const listingId = workspaceEntityId(workspaceId, `manual:ebay-listing:${params.id}`);

  const existingLiveListing = await db.prepare(`
    SELECT id
    FROM listings
    WHERE workspace_id = ?
      AND inventory_item_id = ?
      AND status IN ('active', 'scheduled')
      AND id <> ?
    LIMIT 1
  `).bind(workspaceId, params.id, listingId).first<{ id: string }>();

  if (existingLiveListing) {
    return json({
      error: 'This inventory item already has a live or scheduled listing record.'
    }, { status: 409 });
  }

  if (ebayItemId) {
    const duplicateInventory = await db.prepare(`
      SELECT id
      FROM inventory_items
      WHERE workspace_id = ?
        AND id <> ?
        AND ebay_item_id = ?
      LIMIT 1
    `).bind(workspaceId, params.id, ebayItemId).first<{ id: string }>();

    if (duplicateInventory) {
      return json({ error: 'That eBay Item ID is already attached to another inventory item.' }, {
        status: 409
      });
    }

    const duplicateListing = await db.prepare(`
      SELECT inventory_item_id AS inventoryItemId
      FROM listings
      WHERE workspace_id = ?
        AND marketplace_provider = 'ebay'
        AND external_listing_id = ?
        AND inventory_item_id <> ?
      LIMIT 1
    `).bind(workspaceId, ebayItemId, params.id).first<{ inventoryItemId: string }>();

    if (duplicateListing) {
      return json({ error: 'That eBay Item ID is already tracked by another listing.' }, {
        status: 409
      });
    }
  }

  const now = new Date().toISOString();
  const listPriceCents = Number(body.listPriceCents);
  const viewItemUrl = ebayItemId ? `https://www.ebay.com/itm/${ebayItemId}` : null;

  await db.batch([
    db.prepare(`
      INSERT INTO listings (
        id,
        inventory_item_id,
        ebay_listing_id,
        marketplace_provider,
        external_listing_id,
        price_cents,
        currency,
        quantity,
        listed_at,
        ended_at,
        status,
        view_item_url,
        created_at,
        updated_at,
        workspace_id
      )
      VALUES (
        ?, ?, ?,
        'ebay', ?,
        ?, 'USD', 1,
        ?, NULL, 'active', ?,
        ?, ?, ?
      )
      ON CONFLICT(id) DO UPDATE SET
        ebay_listing_id = excluded.ebay_listing_id,
        marketplace_provider = 'ebay',
        external_listing_id = excluded.external_listing_id,
        price_cents = excluded.price_cents,
        listed_at = excluded.listed_at,
        ended_at = NULL,
        status = 'active',
        view_item_url = excluded.view_item_url,
        updated_at = excluded.updated_at
    `).bind(
      listingId,
      params.id,
      ebayItemId,
      ebayItemId,
      listPriceCents,
      listedAt,
      viewItemUrl,
      now,
      now,
      workspaceId
    ),
    db.prepare(`
      UPDATE inventory_items
      SET
        ebay_item_id = ?,
        status = 'active',
        target_list_price_cents = ?,
        updated_at = ?
      WHERE id = ?
        AND workspace_id = ?
        AND status = 'unlisted'
    `).bind(
      ebayItemId,
      listPriceCents,
      now,
      params.id,
      workspaceId
    )
  ]);

  return json({
    ok: true,
    id: params.id,
    listingId,
    ebayItemId,
    listPriceCents,
    listedAt
  });
};

export const DELETE: RequestHandler = async ({ platform, params, locals }) => {
  if (!platform) {
    return json({ error: 'Cloudflare runtime is unavailable.' }, { status: 503 });
  }

  const db = platform.env.DB;
  const workspaceId = currentWorkspaceId(locals);
  const listingId = workspaceEntityId(workspaceId, `manual:ebay-listing:${params.id}`);

  const listing = await db.prepare(`
    SELECT l.id
    FROM listings l
    JOIN inventory_items i
      ON i.id = l.inventory_item_id
      AND i.workspace_id = l.workspace_id
    WHERE l.id = ?
      AND l.workspace_id = ?
      AND l.inventory_item_id = ?
      AND l.marketplace_provider = 'ebay'
      AND l.status = 'active'
      AND i.status = 'active'
    LIMIT 1
  `).bind(listingId, workspaceId, params.id).first<{ id: string }>();

  if (!listing) {
    return json({
      error: 'The manual listing can no longer be safely undone.'
    }, { status: 409 });
  }

  const now = new Date().toISOString();

  await db.batch([
    db.prepare(`
      DELETE FROM listings
      WHERE id = ?
        AND workspace_id = ?
        AND inventory_item_id = ?
    `).bind(listingId, workspaceId, params.id),
    db.prepare(`
      UPDATE inventory_items
      SET
        ebay_item_id = NULL,
        status = 'unlisted',
        updated_at = ?
      WHERE id = ?
        AND workspace_id = ?
        AND status = 'active'
    `).bind(now, params.id, workspaceId)
  ]);

  return json({ ok: true, id: params.id });
};
