import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { currentWorkspaceId } from '$lib/server/workspace';
import { workspaceEntityId } from '$lib/server/workspace';

type ManualSaleBody = {
  inventoryItemId?: unknown;
  title?: unknown;
  soldAt?: unknown;
  channel?: unknown;
  quantity?: unknown;
  salePriceCents?: unknown;
  buyerShippingCents?: unknown;
  purchaseCostCents?: unknown;
  feesCents?: unknown;
  shippingLabelCents?: unknown;
  trackingNumber?: unknown;
  note?: unknown;
  imageUrl?: unknown;
};

function clean(value: unknown, max: number) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function saleDate(value: unknown) {
  const date = clean(value, 10);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return `${date}T12:00:00.000Z`;
}

function requiredCents(value: unknown, field: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100_000_000) {
    throw new Error(`${field} is invalid.`);
  }
  return parsed;
}

function optionalCents(value: unknown, field: string) {
  if (value == null || value === '') return null;
  return requiredCents(value, field);
}

export const POST: RequestHandler = async ({ platform, request, locals }) => {
  if (!platform) return json({ error: 'Cloudflare runtime is unavailable.' }, { status: 503 });
  const workspaceId = currentWorkspaceId(locals);
  const body = await request.json().catch(() => null) as ManualSaleBody | null;
  if (!body) return json({ error: 'Sale details are required.' }, { status: 400 });

  const inventoryItemId = clean(body.inventoryItemId, 300);
  const soldAt = saleDate(body.soldAt);
  const channel = clean(body.channel, 80);
  const trackingNumber = clean(body.trackingNumber, 120);
  const note = clean(body.note, 500);
  const imageUrl = clean(body.imageUrl, 1000);
  const quantity = Number(body.quantity ?? 1);

  if (!soldAt) return json({ error: 'Choose a valid sold date.' }, { status: 400 });
  if (!channel) return json({ error: 'Choose where the item sold.' }, { status: 400 });
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
    return json({ error: 'Quantity must be between 1 and 50.' }, { status: 400 });
  }

  let salePriceCents: number;
  let buyerShippingCents: number;
  let feesCents: number;
  let shippingLabelCents: number;
  let purchaseCostCents: number | null;

  try {
    salePriceCents = requiredCents(body.salePriceCents, 'Sale price');
    buyerShippingCents = requiredCents(body.buyerShippingCents ?? 0, 'Buyer-paid shipping');
    feesCents = requiredCents(body.feesCents ?? 0, 'Fees');
    shippingLabelCents = requiredCents(body.shippingLabelCents ?? 0, 'Shipping label');
    purchaseCostCents = optionalCents(body.purchaseCostCents, 'Purchase cost');
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'A money value is invalid.' }, { status: 400 });
  }

  if (salePriceCents <= 0) return json({ error: 'Sale price must be greater than $0.' }, { status: 400 });

  let inventoryId = inventoryItemId;
  let title = clean(body.title, 240);
  let existingCost: number | null = null;

  if (inventoryId) {
    const item = await platform.env.DB.prepare(`
      SELECT id, title, purchase_cost_cents AS costCents, status
      FROM inventory_items
      WHERE workspace_id = ? AND id = ?
      LIMIT 1
    `).bind(workspaceId, inventoryId).first<{
      id: string;
      title: string;
      costCents: number | null;
      status: string;
    }>();

    if (!item) return json({ error: 'Inventory item not found.' }, { status: 404 });
    if (item.status === 'sold') return json({ error: 'This item is already closed out.' }, { status: 409 });
    title = item.title;
    existingCost = item.costCents == null ? null : Number(item.costCents);
    if (quantity !== 1) {
      return json({ error: 'Tracked inventory items are sold one record at a time. Use quantity 1.' }, { status: 400 });
    }
  } else {
    if (!title) return json({ error: 'Enter an item name.' }, { status: 400 });
    inventoryId = `manual:${crypto.randomUUID()}`;
  }

  const id = crypto.randomUUID();
  const orderId = `manual-order:${id}`;
  const lineId = `manual-line:${id}`;
  const orderDbId = workspaceEntityId(workspaceId, orderId);
  const lineDbId = workspaceEntityId(workspaceId, lineId);
  const now = new Date().toISOString();
  const grossCents = salePriceCents + buyerShippingCents;
  const finalCost = purchaseCostCents ?? existingCost;

  const statements: D1PreparedStatement[] = [];

  if (!inventoryItemId) {
    statements.push(platform.env.DB.prepare(`
      INSERT INTO inventory_items (
        workspace_id, id, title, image_url, inventory_category,
        purchase_cost_cents, source, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'other', ?, ?, 'sold', ?, ?)
    `).bind(workspaceId, inventoryId, title, imageUrl, finalCost, channel, now, now));
  } else {
    statements.push(platform.env.DB.prepare(`
      UPDATE inventory_items
      SET purchase_cost_cents = COALESCE(?, purchase_cost_cents), status = 'sold', updated_at = ?
      WHERE workspace_id = ? AND id = ?
    `).bind(purchaseCostCents, now, workspaceId, inventoryId));

    statements.push(platform.env.DB.prepare(`
      UPDATE listings
      SET status = 'ended', ended_at = COALESCE(ended_at, ?), updated_at = ?
      WHERE workspace_id = ? AND inventory_item_id = ? AND status IN ('active', 'scheduled')
    `).bind(soldAt, now, workspaceId, inventoryId));
  }

  statements.push(platform.env.DB.prepare(`
    INSERT INTO orders (
      id, ebay_order_id, marketplace_provider, external_order_id,
      created_at_ebay, status, gross_total_cents, currency,
      created_at, updated_at, workspace_id
    ) VALUES (?, NULL, 'manual', ?, ?, 'PAID', ?, 'USD', ?, ?, ?)
  `).bind(orderDbId, orderId, soldAt, grossCents, now, now, workspaceId));

  statements.push(platform.env.DB.prepare(`
    INSERT INTO order_items (
      id, order_id, inventory_item_id, ebay_line_item_id, ebay_item_id,
      marketplace_provider, external_line_item_id, external_item_id,
      title, quantity, sale_price_cents, shipping_charged_cents,
      sold_at, created_at, updated_at, workspace_id
    ) VALUES (?, ?, ?, NULL, NULL, 'manual', ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    lineDbId, orderDbId, inventoryId, lineId, title, quantity,
    salePriceCents, buyerShippingCents, soldAt, now, now, workspaceId
  ));

  statements.push(platform.env.DB.prepare(`
    INSERT INTO manual_sale_metadata (
      order_item_id, workspace_id, channel_label, tracking_number, note, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(lineDbId, workspaceId, channel, trackingNumber, note, now, now));

  const addFinance = (kind: 'selling_fee' | 'shipping_label', amount: number, description: string) => {
    if (amount <= 0) return;
    const externalId = `manual:${kind}:${id}`;
    statements.push(platform.env.DB.prepare(`
      INSERT INTO financial_transactions (
        id, ebay_transaction_id, ebay_order_id, ebay_line_item_id,
        marketplace_provider, external_transaction_id, external_order_id, external_line_item_id,
        transaction_type, amount_cents, currency, transaction_date, fee_type,
        booking_entry, category, source, description, reference_id,
        created_at, updated_at, workspace_id
      ) VALUES (?, NULL, NULL, NULL, 'manual', ?, ?, ?, ?, ?, 'USD', ?, ?, 'DEBIT', ?, 'manual_sale', ?, ?, ?, ?, ?)
    `).bind(
      workspaceEntityId(workspaceId, `finance:${externalId}`),
      externalId, orderId, lineId,
      kind === 'selling_fee' ? 'MANUAL_SELLING_FEE' : 'MANUAL_SHIPPING_LABEL',
      -Math.abs(amount), soldAt,
      kind === 'selling_fee' ? 'MANUAL_SELLING_FEE' : 'MANUAL_SHIPPING_LABEL',
      kind, description, lineId, now, now, workspaceId
    ));
  };

  addFinance('selling_fee', feesCents, `${channel} selling/payment fees`);
  addFinance('shipping_label', shippingLabelCents, `${channel} shipping cost`);

  await platform.env.DB.batch(statements);

  return json({
    ok: true,
    saleId: lineDbId,
    inventoryItemId: inventoryId,
    channel,
    grossCents,
    purchaseCostCents: finalCost
  });
};
