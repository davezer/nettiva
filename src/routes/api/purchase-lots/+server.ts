import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { InventoryCategory } from '$lib/types';
import { getInventoryCategoryDefinition } from '$lib/server/inventory-categories';
import { allocateSkuRange } from '$lib/server/sku-control';
import { currentWorkspaceId } from '$lib/server/workspace';

type LotItemInput = {
  title?: unknown;
  category?: unknown;
  conditionName?: unknown;
  skuPrefix?: unknown;
  manualCostCents?: unknown;
};

type PurchaseLotInput = {
  label?: unknown;
  source?: unknown;
  purchasedAt?: unknown;
  purchasePriceCents?: unknown;
  taxFeesCents?: unknown;
  inboundShippingCents?: unknown;
  defaultLocation?: unknown;
  notes?: unknown;
  allocationMode?: unknown;
  items?: unknown;
};

function clean(value: unknown, max: number) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function cents(value: unknown, label: string) {
  if (!Number.isInteger(value) || Number(value) < 0 || Number(value) > 100_000_000) {
    throw new Error(`Enter a valid ${label}.`);
  }
  return Number(value);
}

function purchaseDate(value: unknown) {
  const date = clean(value, 10);
  if (!date) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T12:00:00.000Z` : undefined;
}

function prefix(value: unknown, defaultPrefix: string) {
  const chosen = clean(value, 8)?.toUpperCase() ?? defaultPrefix;
  return /^[A-Z0-9]{2,8}$/.test(chosen) ? chosen : null;
}

function equalAllocations(totalCents: number, count: number) {
  const base = Math.floor(totalCents / count);
  const remainder = totalCents - base * count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

export const POST: RequestHandler = async ({ platform, request, locals }) => {
  if (!platform) {
    return json({ error: 'Cloudflare runtime is unavailable.' }, { status: 503 });
  }

  const db = platform.env.DB;
  const workspaceId = currentWorkspaceId(locals);
  const body = await request.json().catch(() => null) as PurchaseLotInput | null;

  if (!body) {
    return json({ error: 'Purchase lot details are required.' }, { status: 400 });
  }

  try {
    const label = clean(body.label, 160);
    const source = clean(body.source, 120);
    const defaultLocation = clean(body.defaultLocation, 80);
    const notes = clean(body.notes, 1200);
    const purchasedAt = purchaseDate(body.purchasedAt);

    if (!label) {
      return json({ error: 'Give this purchase lot a name.' }, { status: 400 });
    }
    if (body.purchasedAt && purchasedAt === undefined) {
      return json({ error: 'Choose a valid purchase date.' }, { status: 400 });
    }

    const purchasePriceCents = cents(body.purchasePriceCents ?? 0, 'purchase amount');
    const taxFeesCents = cents(body.taxFeesCents ?? 0, 'tax / buyer fees amount');
    const inboundShippingCents = cents(body.inboundShippingCents ?? 0, 'inbound shipping amount');
    const totalCostCents = purchasePriceCents + taxFeesCents + inboundShippingCents;

    const allocationMode = body.allocationMode === 'manual' ? 'manual' : 'equal';

    if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 50) {
      return json({ error: 'A purchase lot must contain between 1 and 50 items.' }, { status: 400 });
    }

    const items: {
      title: string;
      category: InventoryCategory;
      conditionName: string | null;
      skuPrefix: string;
      manualCostCents: number | null;
    }[] = [];

    for (const [index, raw] of body.items.entries()) {
      const item = raw as LotItemInput;
      const title = clean(item.title, 240);
      const category = clean(item.category, 40) as InventoryCategory | null;
      const conditionName = clean(item.conditionName, 80);

      if (!title) throw new Error(`Item ${index + 1} needs a title.`);
      if (!category) throw new Error(`Item ${index + 1} needs a valid category.`);

      const categoryDefinition = await getInventoryCategoryDefinition(db, workspaceId, category);
      if (!categoryDefinition || categoryDefinition.enabled === false) {
        throw new Error(`Item ${index + 1} needs an enabled category.`);
      }

      const skuPrefix = prefix(item.skuPrefix, categoryDefinition.prefix);
      if (!skuPrefix) throw new Error(`Item ${index + 1} has an invalid SKU prefix.`);

      let manualCostCents: number | null = null;
      if (allocationMode === 'manual') {
        manualCostCents = cents(item.manualCostCents, `COGS for item ${index + 1}`);
      }

      items.push({
        title,
        category,
        conditionName,
        skuPrefix,
        manualCostCents
      });
    }

    let allocations: number[];

    if (allocationMode === 'manual') {
      allocations = items.map((item) => Number(item.manualCostCents ?? 0));
      const manualTotal = allocations.reduce((sum, value) => sum + value, 0);

      if (manualTotal !== totalCostCents) {
        return json({
          error:
            `Manual item COGS totals $${(manualTotal / 100).toFixed(2)}, but the lot landed total is ` +
            `$${(totalCostCents / 100).toFixed(2)}. The totals must match exactly.`
        }, { status: 400 });
      }
    } else {
      allocations = equalAllocations(totalCostCents, items.length);
    }

    // Allocate SKU ranges by prefix. Permanent high-water behavior is preserved:
    // if the later insert fails, those numbers remain consumed rather than recycled.
    const indexesByPrefix = new Map<string, number[]>();
    items.forEach((item, index) => {
      const indexes = indexesByPrefix.get(item.skuPrefix) ?? [];
      indexes.push(index);
      indexesByPrefix.set(item.skuPrefix, indexes);
    });

    const skus = new Array<string>(items.length);
    for (const [skuPrefix, indexes] of indexesByPrefix) {
      const allocated = await allocateSkuRange(db, workspaceId, skuPrefix, indexes.length);
      indexes.forEach((itemIndex, allocationIndex) => {
        skus[itemIndex] = allocated[allocationIndex];
      });
    }

    const lotId = `lot:${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const itemIds = items.map(() => `manual:${crypto.randomUUID()}`);

    const statements: D1PreparedStatement[] = [
      db.prepare(`
        INSERT INTO purchase_lots (
          id,
          workspace_id,
          label,
          source,
          purchased_at,
          purchase_price_cents,
          tax_fees_cents,
          inbound_shipping_cents,
          total_cost_cents,
          default_location,
          notes,
          allocation_mode,
          item_count,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        lotId,
        workspaceId,
        label,
        source,
        purchasedAt,
        purchasePriceCents,
        taxFeesCents,
        inboundShippingCents,
        totalCostCents,
        defaultLocation,
        notes,
        allocationMode,
        items.length,
        now,
        now
      )
    ];

    items.forEach((item, index) => {
      statements.push(db.prepare(`
        INSERT INTO inventory_items (
          workspace_id,
          id,
          title,
          sku,
          condition_name,
          inventory_category,
          intake_batch_id,
          purchase_lot_id,
          purchase_cost_cents,
          source,
          storage_location,
          purchased_at,
          status,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unlisted', ?, ?)
      `).bind(
        workspaceId,
        itemIds[index],
        item.title,
        skus[index],
        item.conditionName,
        item.category,
        lotId,
        lotId,
        allocations[index],
        source,
        defaultLocation,
        purchasedAt,
        now,
        now
      ));
    });

    await db.batch(statements);

    return json({
      ok: true,
      lotId,
      label,
      itemCount: items.length,
      totalCostCents,
      allocationMode,
      ids: itemIds,
      skus,
      allocations
    });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : 'Could not create this purchase lot.' },
      { status: 400 }
    );
  }
};
