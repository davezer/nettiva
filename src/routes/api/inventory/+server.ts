import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { InventoryCategory } from '$lib/types';
import { allocateSkuRange, observeSku } from '$lib/server/sku-control';

const INVENTORY_CATEGORIES = new Set<InventoryCategory>([
  'action_figures',
  'baseball_cards',
  'electronics',
  'movies',
  'video_games',
  'trading_cards',
  'collectibles',
  'other'
]);

type InventoryInput = {
  title?: unknown;
  sku?: unknown;
  autoSku?: unknown;
  skuPrefix?: unknown;
  quantity?: unknown;
  category?: unknown;
  purchaseCostCents?: unknown;
  source?: unknown;
  storageLocation?: unknown;
  purchasedAt?: unknown;
  conditionName?: unknown;
};

function clean(value: unknown, max: number) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function purchaseDate(value: unknown) {
  const date = clean(value, 10);
  if (!date) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T12:00:00.000Z` : null;
}

function normalizedPrefix(value: unknown) {
  const prefix = clean(value, 8)?.toUpperCase() ?? null;
  return prefix && /^[A-Z0-9]{2,8}$/.test(prefix) ? prefix : null;
}


export const POST: RequestHandler = async ({ platform, request }) => {
  if (!platform) {
    return json({ error: 'Cloudflare runtime is unavailable.' }, { status: 503 });
  }

  const body = await request.json().catch(() => null) as InventoryInput | null;
  if (!body) return json({ error: 'Inventory details are required.' }, { status: 400 });

  const title = clean(body.title, 240);
  const source = clean(body.source, 120);
  const storageLocation = clean(body.storageLocation, 80);
  const conditionName = clean(body.conditionName, 80);
  const purchasedAt = purchaseDate(body.purchasedAt);
  const purchaseCostCents = Number(body.purchaseCostCents);
  const quantity = Number(body.quantity ?? 1);
  const category = clean(body.category, 40) as InventoryCategory | null;
  const autoSku = body.autoSku !== false;

  if (!title) return json({ error: 'Enter an item title.' }, { status: 400 });
  if (!Number.isInteger(purchaseCostCents) || purchaseCostCents < 0) {
    return json({ error: 'Enter a valid purchase cost.' }, { status: 400 });
  }
  if (body.purchasedAt && !purchasedAt) {
    return json({ error: 'Choose a valid purchase date.' }, { status: 400 });
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
    return json({ error: 'Quantity must be between 1 and 50.' }, { status: 400 });
  }
  if (!category || !INVENTORY_CATEGORIES.has(category)) {
    return json({ error: 'Choose a valid inventory category.' }, { status: 400 });
  }

  let skus: string[] = [];

  if (autoSku) {
    const prefix = normalizedPrefix(body.skuPrefix);
    if (!prefix) {
      return json({ error: 'Auto SKU prefix must be 2–8 letters or numbers.' }, { status: 400 });
    }

    skus = await allocateSkuRange(platform.env.DB, prefix, quantity);
  } else {
    if (quantity !== 1) {
      return json({ error: 'Batch intake requires automatic SKUs so every item stays individually trackable.' }, { status: 400 });
    }

    const sku = clean(body.sku, 100);
    if (!sku) {
      return json({ error: 'Enter a SKU/custom label or turn automatic SKU generation on.' }, { status: 400 });
    }
    skus = [sku];
  }

  // Auto-generated values should be free already, but this also protects custom
  // values and catches any collision before the batch is written.
  for (const sku of skus) {
    const duplicate = await platform.env.DB.prepare(`
      SELECT sku FROM (
        SELECT sku FROM inventory_items
        WHERE sku IS NOT NULL AND LOWER(TRIM(sku)) = LOWER(TRIM(?))
        UNION ALL
        SELECT sku FROM sku_reservations
        WHERE LOWER(TRIM(sku)) = LOWER(TRIM(?))
      )
      LIMIT 1
    `).bind(sku, sku).first<{ sku: string }>();

    if (duplicate) {
      return json({ error: `SKU ${sku} is already used or reserved. Nettiva will not recycle it.` }, { status: 409 });
    }
  }

  if (!autoSku) await observeSku(platform.env.DB, skus[0]);

  const now = new Date().toISOString();
  const batchId = quantity > 1 ? `batch:${crypto.randomUUID()}` : null;
  const ids = skus.map(() => `manual:${crypto.randomUUID()}`);

  const statements = ids.map((id, index) => platform.env.DB.prepare(`
    INSERT INTO inventory_items (
      id, title, sku, condition_name, inventory_category, intake_batch_id,
      purchase_cost_cents, source, storage_location, purchased_at,
      status, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unlisted', ?, ?)
  `).bind(
    id,
    title,
    skus[index],
    conditionName,
    category,
    batchId,
    purchaseCostCents,
    source,
    storageLocation,
    purchasedAt,
    now,
    now
  ));

  await platform.env.DB.batch(statements);

  return json({
    ok: true,
    ids,
    skus,
    count: ids.length,
    batchId
  });
};
