import {
  categoryFromCsv,
  csvLineItemRef,
  moneyToCents,
  slug,
  stableOrderItemId,
  type FinanceCategory
} from './finance-normalize';
import { DEFAULT_WORKSPACE_ID, workspaceEntityId } from './workspace';

type CsvRecord = Record<string, string>;

type InventoryIdentity = {
  id: string;
  sku: string | null;
  ebayItemId: string | null;
  status: string;
  purchaseCostCents: number | null;
};

type ListingIdentityRow = {
  inventoryItemId: string;
  externalListingId: string | null;
  status: string;
};

type InventoryMatchReason = 'ebay_item_id' | 'listing_id' | 'sku';

type InventoryMatch = {
  inventory: InventoryIdentity;
  reason: InventoryMatchReason;
};

export type CsvImportResult = {
  batchId: string;
  rowsSeen: number;
  rowsImported: number;
  ordersImported: number;
  transactionsImported: number;
  sellingFeesImported: number;
  shippingLabelsImported: number;
  payoutsImported: number;
  unallocatedTransactions: number;
  inventoryMatched: number;
  inventoryCreated: number;
  listingsEnded: number;
  cogsPreserved: number;
};

const FEE_COLUMNS = [
  'Final Value Fee - fixed',
  'Final Value Fee - variable',
  'Regulatory operating fee',
  'Very high "item not as described" fee',
  'Below standard performance fee',
  'International fee',
  'Charity donation',
  'Deposit processing fee'
] as const;

function clean(value?: string | null) {
  const trimmed = value?.trim() ?? '';
  return !trimmed || trimmed === '--' ? null : trimmed;
}

function normalizedSku(value?: string | null) {
  return clean(value)?.toLowerCase() ?? null;
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (field.length || row.length) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }

  return rows;
}

function reportRows(text: string): CsvRecord[] {
  const parsed = parseCsv(text.replace(/^\uFEFF/, ''));
  const headerIndex = parsed.findIndex(
    (row) => row[0]?.trim() === 'Transaction creation date' && row[1]?.trim() === 'Type'
  );

  if (headerIndex < 0) {
    throw new Error('This does not look like an eBay Transaction report CSV.');
  }

  const headers = parsed[headerIndex].map((header) => header.trim());
  return parsed
    .slice(headerIndex + 1)
    .filter((row) => row.some((cell) => cell.trim() !== ''))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])));
}

function reportDateToIso(value?: string | null) {
  const raw = clean(value);
  if (!raw) return new Date().toISOString();

  const match = raw.match(/^([A-Za-z]{3})\s+(\d{1,2}),\s+(\d{4})$/);
  if (!match) {
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
  }

  const months: Record<string, number> = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
    Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11
  };
  const month = months[match[1]];
  return new Date(Date.UTC(Number(match[3]), month, Number(match[2]), 12)).toISOString();
}

async function shortHash(seed: string) {
  const bytes = new TextEncoder().encode(seed);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .slice(0, 12)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function transactionSeed(row: CsvRecord) {
  return [
    row['Transaction creation date'],
    row['Type'],
    row['Order number'],
    row['Net amount'],
    row['Payout ID'],
    row['Reference ID'],
    row['Description'],
    row['Item ID'],
    row['Item title']
  ].join('\u001f');
}

function bookingEntry(amountCents: number) {
  return amountCents < 0 ? 'DEBIT' : 'CREDIT';
}

function isExpenseCategory(category: FinanceCategory) {
  return [
    'selling_fee',
    'shipping_label',
    'refund',
    'dispute',
    'other_fee',
    'withheld_tax',
    'purchase'
  ].includes(category);
}

async function runStatements(db: D1Database, statements: D1PreparedStatement[]) {
  for (let index = 0; index < statements.length; index += 100) {
    await db.batch(statements.slice(index, index + 100));
  }
}

function addSkuIdentity(
  map: Map<string, InventoryIdentity[]>,
  inventory: InventoryIdentity
) {
  const key = normalizedSku(inventory.sku);
  if (!key) return;

  const rows = map.get(key) ?? [];
  if (!rows.some((row) => row.id === inventory.id)) rows.push(inventory);
  map.set(key, rows);
}

function chooseSkuCandidate(
  map: Map<string, InventoryIdentity[]>,
  sku: string
): InventoryIdentity | null {
  const key = normalizedSku(sku);
  if (!key) return null;

  const candidates = map.get(key) ?? [];
  if (!candidates.length) return null;

  const unsold = candidates.filter((row) => row.status !== 'sold');
  if (unsold.length === 1) return unsold[0];

  if (unsold.length > 1) {
    throw new Error(
      `More than one unsold Sellquity inventory item uses SKU/custom label "${sku}". ` +
      'Resolve the duplicate SKU before importing this report.'
    );
  }

  if (candidates.length === 1) return candidates[0];

  throw new Error(
    `More than one Sellquity inventory record uses SKU/custom label "${sku}". ` +
    'Resolve the duplicate SKU before importing this report.'
  );
}

export async function importEbayTransactionCsv(
  db: D1Database,
  text: string,
  filename: string | null,
  workspaceId: string = DEFAULT_WORKSPACE_ID
): Promise<CsvImportResult> {
  const rows = reportRows(text);
  const batchId = crypto.randomUUID();
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  const lineRefByOrder = new Map<string, string>();

  let rowsImported = 0;
  let ordersImported = 0;
  let transactionsImported = 0;
  let sellingFeesImported = 0;
  let shippingLabelsImported = 0;
  let payoutsImported = 0;
  let unallocatedTransactions = 0;
  let inventoryMatched = 0;
  let inventoryCreated = 0;
  let listingsEnded = 0;
  let cogsPreserved = 0;

  const inventoryResult = await db.prepare(`
    SELECT
      id,
      sku,
      ebay_item_id AS ebayItemId,
      status,
      purchase_cost_cents AS purchaseCostCents
    FROM inventory_items
    WHERE workspace_id = ?
  `).bind(workspaceId).all();

  const inventoryRows = (inventoryResult.results as unknown as InventoryIdentity[]).map((row) => ({
    ...row,
    purchaseCostCents: row.purchaseCostCents == null ? null : Number(row.purchaseCostCents)
  }));

  const inventoryById = new Map<string, InventoryIdentity>();
  const inventoryByItemId = new Map<string, InventoryIdentity>();
  const inventoryBySku = new Map<string, InventoryIdentity[]>();
  const inventoryIdsAtStart = new Set<string>();

  for (const inventory of inventoryRows) {
    inventoryById.set(inventory.id, inventory);
    inventoryIdsAtStart.add(inventory.id);
    if (inventory.ebayItemId) inventoryByItemId.set(inventory.ebayItemId, inventory);
    addSkuIdentity(inventoryBySku, inventory);
  }

  const listingResult = await db.prepare(`
    SELECT
      inventory_item_id AS inventoryItemId,
      COALESCE(external_listing_id, ebay_listing_id) AS externalListingId,
      status
    FROM listings
    WHERE workspace_id = ?
      AND marketplace_provider = 'ebay'
  `).bind(workspaceId).all();

  const listingRows = listingResult.results as unknown as ListingIdentityRow[];
  const inventoryByListingId = new Map<string, InventoryIdentity>();
  const liveListingCounts = new Map<string, number>();

  for (const listing of listingRows) {
    const inventory = inventoryById.get(listing.inventoryItemId);
    if (!inventory) continue;

    if (listing.externalListingId) {
      inventoryByListingId.set(listing.externalListingId, inventory);
    }

    if (listing.status === 'active' || listing.status === 'scheduled') {
      liveListingCounts.set(
        listing.inventoryItemId,
        (liveListingCounts.get(listing.inventoryItemId) ?? 0) + 1
      );
    }
  }

  function findInventoryMatch(
    itemId: string | null,
    customLabel: string | null
  ): InventoryMatch | null {
    const itemInventory = itemId
      ? inventoryByItemId.get(itemId) ?? inventoryByListingId.get(itemId) ?? null
      : null;

    const skuCandidates = customLabel && normalizedSku(customLabel)
      ? inventoryBySku.get(normalizedSku(customLabel)!) ?? []
      : [];

    if (itemInventory) {
      const conflictingUnsold = skuCandidates.find(
        (candidate) => candidate.id !== itemInventory.id && candidate.status !== 'sold'
      );

      if (conflictingUnsold) {
        throw new Error(
          `eBay Item ID ${itemId} and Custom label "${customLabel}" point to different ` +
          'Sellquity inventory items. Resolve that identity conflict before importing.'
        );
      }

      return {
        inventory: itemInventory,
        reason: itemId && inventoryByItemId.has(itemId) ? 'ebay_item_id' : 'listing_id'
      };
    }

    if (!customLabel) return null;

    const skuInventory = chooseSkuCandidate(inventoryBySku, customLabel);
    return skuInventory ? { inventory: skuInventory, reason: 'sku' } : null;
  }

  await db.prepare(`
    INSERT INTO import_batches (
      workspace_id, id, source, filename, rows_seen, imported_at
    )
    VALUES (?, ?, 'ebay_csv', ?, ?, ?)
  `).bind(workspaceId, batchId, filename, rows.length, now).run();

  // First pass: establish deterministic order-line references so label/refund rows
  // can attach to a sale even when they occur before the order row in the report.
  for (const [index, row] of rows.entries()) {
    if (clean(row['Type'])?.toLowerCase() !== 'order') continue;
    const orderId = clean(row['Order number']);
    if (!orderId) continue;
    const itemId = clean(row['Item ID']);
    const transactionId = clean(row['Transaction ID']);
    lineRefByOrder.set(orderId, csvLineItemRef(orderId, itemId, transactionId ?? String(index)));
  }

  for (const [index, row] of rows.entries()) {
    const type = clean(row['Type']);
    if (!type) continue;

    const category = categoryFromCsv(type);
    const orderId = clean(row['Order number']);
    const itemId = clean(row['Item ID']);
    const transactionId = clean(row['Transaction ID']);
    const title = clean(row['Item title']) ?? 'Untitled eBay item';
    const soldAt = reportDateToIso(row['Transaction creation date']);
    const currency = clean(row['Payout currency']) ?? clean(row['Transaction currency']) ?? 'USD';
    const netAmountCents = moneyToCents(row['Net amount']);
    const grossAmountCents = moneyToCents(row['Gross transaction amount']);
    const itemSubtotalCents = moneyToCents(row['Item subtotal']);
    const shippingChargedCents = moneyToCents(row['Shipping and handling']);
    const ebayCollectedTaxCents = moneyToCents(row['eBay collected tax']);
    const payoutId = clean(row['Payout ID']);
    const referenceId = clean(row['Reference ID']);
    const description = clean(row['Description']);
    const customLabel = clean(row['Custom label']);
    const lineRef = orderId ? lineRefByOrder.get(orderId) ?? null : null;

    let externalTransactionId = transactionId;
    if (!externalTransactionId) {
      externalTransactionId = `csv:${await shortHash(transactionSeed(row))}`;
    }
    const financeId = workspaceEntityId(workspaceId, `finance:${externalTransactionId}`);

    if (category === 'sale' && orderId) {
      const match = findInventoryMatch(itemId, customLabel);

      let inventoryId: string;
      let matchedInventory: InventoryIdentity | null = null;

      if (match) {
        matchedInventory = match.inventory;
        inventoryId = matchedInventory.id;

        if (inventoryIdsAtStart.has(inventoryId)) {
          inventoryMatched += 1;
          if (matchedInventory.purchaseCostCents !== null) cogsPreserved += 1;
        }

        const liveCount = liveListingCounts.get(inventoryId) ?? 0;
        if (liveCount) {
          listingsEnded += liveCount;
          liveListingCounts.set(inventoryId, 0);
        }

        statements.push(db.prepare(`
          UPDATE inventory_items
          SET
            sku = COALESCE(sku, ?),
            ebay_item_id = COALESCE(ebay_item_id, ?),
            status = 'sold',
            updated_at = ?
          WHERE workspace_id = ?
            AND id = ?
        `).bind(
          customLabel,
          itemId,
          now,
          workspaceId,
          inventoryId
        ));

        statements.push(db.prepare(`
          UPDATE listings
          SET
            ebay_listing_id = COALESCE(ebay_listing_id, ?),
            external_listing_id = COALESCE(external_listing_id, ?),
            view_item_url = COALESCE(view_item_url, ?),
            ended_at = ?,
            status = 'ended',
            updated_at = ?
          WHERE workspace_id = ?
            AND inventory_item_id = ?
            AND marketplace_provider = 'ebay'
            AND status IN ('active', 'scheduled')
        `).bind(
          itemId,
          itemId,
          itemId ? `https://www.ebay.com/itm/${itemId}` : null,
          soldAt,
          now,
          workspaceId,
          inventoryId
        ));

        if (!matchedInventory.sku && customLabel) {
          matchedInventory.sku = customLabel;
          addSkuIdentity(inventoryBySku, matchedInventory);
        }
        if (!matchedInventory.ebayItemId && itemId) {
          matchedInventory.ebayItemId = itemId;
          inventoryByItemId.set(itemId, matchedInventory);
        }
        matchedInventory.status = 'sold';
      } else {
        inventoryId = itemId
          ? workspaceEntityId(workspaceId, `ebay:${itemId}`)
          : workspaceEntityId(
              workspaceId,
              `sold:csv:${await shortHash(`${orderId}:${transactionId ?? index}:${title}`)}`
            );

        const existingHistory = inventoryById.get(inventoryId);
        if (!existingHistory) {
          inventoryCreated += 1;

          const history: InventoryIdentity = {
            id: inventoryId,
            sku: customLabel,
            ebayItemId: itemId,
            status: 'sold',
            purchaseCostCents: null
          };
          inventoryById.set(inventoryId, history);
          if (itemId) inventoryByItemId.set(itemId, history);
          addSkuIdentity(inventoryBySku, history);
        }

        statements.push(db.prepare(`
          INSERT INTO inventory_items (
            workspace_id, id, title, sku, ebay_item_id, status, updated_at
          )
          VALUES (?, ?, ?, ?, ?, 'sold', ?)
          ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            sku = COALESCE(excluded.sku, inventory_items.sku),
            ebay_item_id = COALESCE(excluded.ebay_item_id, inventory_items.ebay_item_id),
            status = 'sold',
            updated_at = excluded.updated_at
        `).bind(workspaceId, inventoryId, title, customLabel, itemId, now));
      }

      const orderItemId = workspaceEntityId(
        workspaceId,
        stableOrderItemId(orderId, itemId, transactionId ?? String(index))
      );
      const orderDbId = workspaceEntityId(workspaceId, `ebay:${orderId}`);
      const csvRef = csvLineItemRef(orderId, itemId, transactionId ?? String(index));
      const quantity = Math.max(1, Number(clean(row['Quantity']) ?? 1) || 1);

      statements.push(db.prepare(`
        INSERT INTO orders (
          workspace_id, id, ebay_order_id, created_at_ebay, status,
          gross_total_cents, currency, updated_at
        )
        VALUES (?, ?, ?, ?, 'PAID', ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          created_at_ebay = excluded.created_at_ebay,
          gross_total_cents = excluded.gross_total_cents,
          currency = excluded.currency,
          updated_at = excluded.updated_at
      `).bind(
        workspaceId,
        orderDbId,
        orderId,
        soldAt,
        grossAmountCents || itemSubtotalCents + shippingChargedCents,
        currency,
        now
      ));

      statements.push(db.prepare(`
        INSERT INTO order_items (
          workspace_id, id, order_id, inventory_item_id, ebay_line_item_id, ebay_item_id,
          title, quantity, sale_price_cents, shipping_charged_cents, sold_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          inventory_item_id = excluded.inventory_item_id,
          title = excluded.title,
          quantity = excluded.quantity,
          sale_price_cents = excluded.sale_price_cents,
          shipping_charged_cents = excluded.shipping_charged_cents,
          sold_at = excluded.sold_at,
          updated_at = excluded.updated_at
      `).bind(
        workspaceId,
        orderItemId,
        orderDbId,
        inventoryId,
        csvRef,
        itemId,
        title,
        quantity,
        itemSubtotalCents,
        shippingChargedCents,
        soldAt,
        now
      ));

      ordersImported += 1;
    }

    statements.push(db.prepare(`
      INSERT INTO financial_transactions (
        workspace_id, id, ebay_transaction_id, ebay_order_id, ebay_line_item_id,
        transaction_type, amount_cents, currency, transaction_date, fee_type,
        booking_entry, category, source, description, payout_id, reference_id,
        gross_amount_cents, item_subtotal_cents, shipping_charged_cents,
        ebay_collected_tax_cents, import_batch_id, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ebay_csv', ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        ebay_order_id = excluded.ebay_order_id,
        ebay_line_item_id = COALESCE(excluded.ebay_line_item_id, financial_transactions.ebay_line_item_id),
        transaction_type = excluded.transaction_type,
        amount_cents = excluded.amount_cents,
        currency = excluded.currency,
        transaction_date = excluded.transaction_date,
        booking_entry = excluded.booking_entry,
        category = excluded.category,
        description = excluded.description,
        payout_id = excluded.payout_id,
        reference_id = excluded.reference_id,
        gross_amount_cents = excluded.gross_amount_cents,
        item_subtotal_cents = excluded.item_subtotal_cents,
        shipping_charged_cents = excluded.shipping_charged_cents,
        ebay_collected_tax_cents = excluded.ebay_collected_tax_cents,
        import_batch_id = excluded.import_batch_id,
        updated_at = excluded.updated_at
    `).bind(
      workspaceId,
      financeId,
      externalTransactionId,
      orderId,
      lineRef,
      type,
      netAmountCents,
      currency,
      soldAt,
      null,
      bookingEntry(netAmountCents),
      category,
      description,
      payoutId,
      referenceId,
      grossAmountCents,
      itemSubtotalCents,
      shippingChargedCents,
      ebayCollectedTaxCents,
      batchId,
      now
    ));

    transactionsImported += 1;
    rowsImported += 1;
    if (category === 'shipping_label') shippingLabelsImported += 1;
    if (category === 'payout') payoutsImported += 1;
    if (!orderId && isExpenseCategory(category) && netAmountCents !== 0) {
      unallocatedTransactions += 1;
    }

    // eBay's order Net amount is already net of these fees. We still store the
    // individual fee rows so sale profit can be calculated from gross order value.
    if (category === 'sale' && transactionId) {
      for (const feeColumn of FEE_COLUMNS) {
        const feeCents = moneyToCents(row[feeColumn]);
        if (!feeCents) continue;

        const normalizedFee = -Math.abs(feeCents);
        const feeKey = slug(feeColumn);
        const feeExternalId = `${transactionId}:fee:${feeKey}`;

        statements.push(db.prepare(`
          INSERT INTO financial_transactions (
            workspace_id, id, ebay_transaction_id, ebay_order_id, ebay_line_item_id,
            transaction_type, amount_cents, currency, transaction_date, fee_type,
            booking_entry, category, source, description, reference_id,
            import_batch_id, updated_at
          )
          VALUES (?, ?, ?, ?, ?, 'SELLING_FEE', ?, ?, ?, ?, 'DEBIT',
            'selling_fee', 'ebay_csv', ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            ebay_order_id = excluded.ebay_order_id,
            ebay_line_item_id = excluded.ebay_line_item_id,
            amount_cents = excluded.amount_cents,
            currency = excluded.currency,
            transaction_date = excluded.transaction_date,
            fee_type = excluded.fee_type,
            description = excluded.description,
            reference_id = excluded.reference_id,
            import_batch_id = excluded.import_batch_id,
            updated_at = excluded.updated_at
        `).bind(
          workspaceId,
          workspaceEntityId(workspaceId, `finance:${feeExternalId}`),
          feeExternalId,
          orderId,
          lineRef,
          normalizedFee,
          currency,
          soldAt,
          feeColumn,
          feeColumn,
          transactionId,
          batchId,
          now
        ));

        sellingFeesImported += 1;
        transactionsImported += 1;
      }
    }
  }

  await runStatements(db, statements);

  await db.prepare(`
    UPDATE import_batches
    SET rows_imported = ?, orders_imported = ?, transactions_imported = ?
    WHERE id = ? AND workspace_id = ?
  `).bind(
    rowsImported,
    ordersImported,
    transactionsImported,
    batchId,
    workspaceId
  ).run();

  return {
    batchId,
    rowsSeen: rows.length,
    rowsImported,
    ordersImported,
    transactionsImported,
    sellingFeesImported,
    shippingLabelsImported,
    payoutsImported,
    unallocatedTransactions,
    inventoryMatched,
    inventoryCreated,
    listingsEnded,
    cogsPreserved
  };
}

/**
 * Backwards-compatible alias for Sellquity's earlier CSV endpoint.
 * Prefer `importEbayTransactionCsv` for all new code.
 */
export async function importEbayCsv(...args: any[]): Promise<any> {
  const db = args.find(
    (value) => value && typeof value === 'object' && typeof value.prepare === 'function'
  ) as D1Database | undefined;

  const objectArg = args.find(
    (value) => value && typeof value === 'object' && typeof value.prepare !== 'function'
  ) as Record<string, unknown> | undefined;

  const possibleStrings = args.filter((value) => typeof value === 'string') as string[];
  const text = possibleStrings.find(
    (value) => value.includes('Transaction creation date') || value.includes('Transaction ID')
  ) ??
    (typeof objectArg?.text === 'string' ? objectArg.text : undefined) ??
    (typeof objectArg?.csvText === 'string' ? objectArg.csvText : undefined) ??
    (typeof objectArg?.rawCsv === 'string' ? objectArg.rawCsv : undefined) ??
    (typeof objectArg?.content === 'string' ? objectArg.content : undefined);

  const filename =
    (typeof objectArg?.filename === 'string' ? objectArg.filename : null) ??
    (typeof objectArg?.fileName === 'string' ? objectArg.fileName : null);

  const workspaceId =
    (typeof objectArg?.workspaceId === 'string' ? objectArg.workspaceId : null) ??
    possibleStrings.find((value) => value === DEFAULT_WORKSPACE_ID || value.startsWith('workspace:')) ??
    DEFAULT_WORKSPACE_ID;

  if (!db) throw new Error('CSV import database binding is missing.');

  if (!text) {
    throw new Error(
      'This legacy CSV endpoint passed parsed data without the original CSV text. Use /import for eBay Transaction reports.'
    );
  }

  return importEbayTransactionCsv(db, text, filename, workspaceId);
}
