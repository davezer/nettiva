import type { InventoryCategory } from '$lib/types';
import { categoryFromSku, observeSku, parseSku } from '$lib/server/sku-control';
import { workspaceEntityId } from '$lib/server/workspace';
import { loadBuiltInInventoryCategories } from '$lib/server/inventory-categories';

type CsvRecord = Record<string, string>;

type InventoryIdentity = {
  id: string;
  sku: string | null;
  ebayItemId: string | null;
  category: InventoryCategory;
  status: string;
};

type ListingIdentity = {
  id: string;
  inventoryItemId: string;
  externalListingId: string | null;
};

export type EbayActiveListingsImportResult = {
  batchId: string;
  rowsSeen: number;
  listingsImported: number;
  inventoryCreated: number;
  inventoryMatched: number;
  skusObserved: number;
  categoriesInferred: number;
  otherCategoryCount: number;
  ageTrackingStartedNow: number;
  multiQuantityListings: number;
};

function clean(value?: string | null) {
  const trimmed = value?.trim() ?? '';
  return !trimmed || trimmed === '--' ? null : trimmed;
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
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

  const headerIndex = parsed.findIndex((row) => {
    const normalized = row.map((cell) => cell.trim().toLowerCase());
    return (
      normalized.some((cell) => ['item number', 'item id', 'itemid'].includes(cell)) &&
      normalized.includes('title')
    );
  });

  if (headerIndex < 0) {
    throw new Error(
      'This does not look like an eBay All active listings report. ' +
      'In Seller Hub use Reports → Downloads → Listings → All active listings.'
    );
  }

  const headers = parsed[headerIndex].map((header) => header.trim());

  return parsed
    .slice(headerIndex + 1)
    .filter((row) => row.some((cell) => cell.trim() !== ''))
    .map((row) =>
      Object.fromEntries(headers.map((header, index) => [header, row[index] ?? '']))
    );
}

function first(row: CsvRecord, names: string[]) {
  for (const name of names) {
    const exact = clean(row[name]);
    if (exact) return exact;
  }

  const normalizedEntries = Object.entries(row).map(([key, value]) => [
    key.trim().toLowerCase(),
    value
  ] as const);

  for (const name of names) {
    const target = name.toLowerCase();
    const matched = normalizedEntries.find(([key]) => key === target);
    const value = clean(matched?.[1]);
    if (value) return value;
  }

  return null;
}

function moneyToCents(value?: string | null) {
  const raw = clean(value)?.replace(/[$,\s]/g, '') ?? '';
  if (!raw) return 0;

  const amount = Number(raw);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

function positiveInteger(value?: string | null) {
  const parsed = Number(clean(value) ?? 1);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
}

function reportDate(value?: string | null) {
  const raw = clean(value);
  if (!raw) return null;

  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function normalizedSku(value?: string | null) {
  return clean(value)?.toLowerCase() ?? null;
}

async function runStatements(db: D1Database, statements: D1PreparedStatement[]) {
  for (let index = 0; index < statements.length; index += 100) {
    await db.batch(statements.slice(index, index + 100));
  }
}

export async function importEbayActiveListingsCsv(
  db: D1Database,
  text: string,
  filename: string | null,
  workspaceId: string
): Promise<EbayActiveListingsImportResult> {
  const rows = reportRows(text);
  const now = new Date().toISOString();
  const batchId = crypto.randomUUID();

  const normalized = rows.map((row, index) => {
    const itemId = first(row, ['Item number', 'Item Number', 'Item ID', 'ItemID']);
    const title = first(row, ['Title', 'Item title', 'Item Title']);
    const sku = first(row, [
      'Custom label (SKU)',
      'Custom Label (SKU)',
      'Custom label',
      'Custom Label',
      'SKU'
    ]);
    const quantity = positiveInteger(
      first(row, ['Available quantity', 'Available Quantity', 'Quantity'])
    );
    const priceCents = moneyToCents(
      first(row, ['Price', 'Start price', 'Start Price', 'Buy It Now price'])
    );
    const variation = first(row, [
      'Variation details',
      'Variation Details',
      'Variation details - Relationship'
    ]);
    const listedAt = reportDate(
      first(row, [
        'Start date',
        'Start Date',
        'Listing start date',
        'Listing Start Date',
        'Listed date',
        'Listed Date'
      ])
    );

    if (!itemId) {
      throw new Error(`Active listing row ${index + 1} is missing its eBay Item number.`);
    }
    if (!title) {
      throw new Error(`Active listing ${itemId} is missing its title.`);
    }

    return {
      itemId,
      title,
      sku,
      quantity,
      priceCents,
      variation,
      listedAt
    };
  });

  const itemIds = new Set<string>();
  for (const row of normalized) {
    if (itemIds.has(row.itemId)) {
      throw new Error(
        `eBay Item ${row.itemId} appears more than once in this report. ` +
        'Sellquity Fresh Start does not yet import multi-variation listings safely.'
      );
    }
    itemIds.add(row.itemId);

    if (row.variation) {
      throw new Error(
        `eBay Item ${row.itemId} contains variation data. ` +
        'Sellquity Fresh Start does not yet import multi-variation listings safely.'
      );
    }
  }

  const inventoryResult = await db.prepare(`
    SELECT
      id,
      sku,
      ebay_item_id AS ebayItemId,
      inventory_category AS category,
      status
    FROM inventory_items
    WHERE workspace_id = ?
  `).bind(workspaceId).all<InventoryIdentity>();

  const inventoryByItemId = new Map<string, InventoryIdentity>();
  const inventoryBySku = new Map<string, InventoryIdentity[]>();

  for (const inventory of inventoryResult.results) {
    if (inventory.ebayItemId) inventoryByItemId.set(inventory.ebayItemId, inventory);

    const key = normalizedSku(inventory.sku);
    if (key) {
      const values = inventoryBySku.get(key) ?? [];
      values.push(inventory);
      inventoryBySku.set(key, values);
    }
  }

  const listingResult = await db.prepare(`
    SELECT
      id,
      inventory_item_id AS inventoryItemId,
      COALESCE(external_listing_id, ebay_listing_id) AS externalListingId
    FROM listings
    WHERE workspace_id = ?
      AND marketplace_provider = 'ebay'
  `).bind(workspaceId).all<ListingIdentity>();

  const listingByItemId = new Map<string, ListingIdentity>();
  for (const listing of listingResult.results) {
    if (listing.externalListingId) {
      listingByItemId.set(listing.externalListingId, listing);
    }
  }

  const [customCategoryResult, builtInCategories] = await Promise.all([
    db.prepare(`
      SELECT
        id,
        sku_prefix AS prefix
      FROM custom_inventory_categories
      WHERE workspace_id = ?
    `).bind(workspaceId).all<{ id: string; prefix: string }>(),
    loadBuiltInInventoryCategories(db, workspaceId)
  ]);

  const customCategoryByPrefix = new Map(
    customCategoryResult.results.map((row) => [row.prefix.toUpperCase(), row.id] as const)
  );

  const builtInCategoryByPrefix = new Map(
    builtInCategories
      .filter((category) => category.enabled !== false)
      .map((category) => [category.prefix.toUpperCase(), category.value] as const)
  );

  const statements: D1PreparedStatement[] = [];
  const importedSkus = new Set<string>();
  let inventoryCreated = 0;
  let inventoryMatched = 0;
  let categoriesInferred = 0;
  let otherCategoryCount = 0;
  let ageTrackingStartedNow = 0;
  let multiQuantityListings = 0;

  statements.push(
    db.prepare(`
      INSERT INTO import_batches (
        workspace_id,
        id,
        source,
        filename,
        rows_seen,
        rows_imported,
        orders_imported,
        transactions_imported,
        imported_at
      )
      VALUES (?, ?, 'ebay_active_csv', ?, ?, ?, 0, 0, ?)
    `).bind(
      workspaceId,
      batchId,
      filename,
      normalized.length,
      normalized.length,
      now
    )
  );

  for (const row of normalized) {
    const skuKey = normalizedSku(row.sku);
    const byItem = inventoryByItemId.get(row.itemId) ?? null;
    const skuMatches = skuKey ? inventoryBySku.get(skuKey) ?? [] : [];
    const unsoldSkuMatches = skuMatches.filter((inventory) => inventory.status !== 'sold');

    if (unsoldSkuMatches.length > 1) {
      throw new Error(
        `More than one unsold Sellquity inventory item uses SKU ${row.sku}. ` +
        'Resolve the duplicate SKU before importing active listings.'
      );
    }

    const bySku = unsoldSkuMatches[0] ?? null;

    if (byItem && bySku && byItem.id !== bySku.id) {
      throw new Error(
        `eBay Item ${row.itemId} and SKU ${row.sku} point to different Sellquity inventory items.`
      );
    }

    const existing = byItem ?? bySku;
    const inventoryId = existing?.id ??
      workspaceEntityId(workspaceId, `ebay:${row.itemId}`);

    let category = existing?.category ?? 'other';

    if (!existing) {
      const parsedSku = parseSku(row.sku);
      const customCategory = parsedSku
        ? customCategoryByPrefix.get(parsedSku.prefix)
        : null;
      const builtInCategory = parsedSku
        ? builtInCategoryByPrefix.get(parsedSku.prefix)
        : null;

      category = (
        customCategory ??
        builtInCategory ??
        categoryFromSku(row.sku)
      ) as InventoryCategory;

      if (category === 'other') {
        otherCategoryCount += 1;
      } else {
        categoriesInferred += 1;
      }

      statements.push(
        db.prepare(`
          INSERT INTO inventory_items (
            workspace_id,
            id,
            title,
            sku,
            ebay_item_id,
            inventory_category,
            status,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            sku = COALESCE(inventory_items.sku, excluded.sku),
            ebay_item_id = COALESCE(inventory_items.ebay_item_id, excluded.ebay_item_id),
            status = 'active',
            updated_at = excluded.updated_at
        `).bind(
          workspaceId,
          inventoryId,
          row.title,
          row.sku,
          row.itemId,
          category,
          now,
          now
        )
      );

      const created: InventoryIdentity = {
        id: inventoryId,
        sku: row.sku,
        ebayItemId: row.itemId,
        category,
        status: 'active'
      };
      inventoryByItemId.set(row.itemId, created);

      if (skuKey) {
        inventoryBySku.set(skuKey, [created]);
      }

      inventoryCreated += 1;
    } else {
      statements.push(
        db.prepare(`
          UPDATE inventory_items
          SET
            title = ?,
            ebay_item_id = COALESCE(ebay_item_id, ?),
            sku = CASE WHEN sku IS NULL OR sku = '' THEN ? ELSE sku END,
            status = 'active',
            updated_at = ?
          WHERE workspace_id = ?
            AND id = ?
        `).bind(
          row.title,
          row.itemId,
          row.sku,
          now,
          workspaceId,
          inventoryId
        )
      );

      inventoryMatched += 1;
    }

    if (row.sku) importedSkus.add(row.sku);

    const existingListing = listingByItemId.get(row.itemId) ?? null;
    const listingId = existingListing?.id ??
      workspaceEntityId(workspaceId, `listing:ebay:${row.itemId}`);

    const listedAt = row.listedAt ?? (
      existingListing
        ? null
        : now
    );

    if (!row.listedAt && !existingListing) ageTrackingStartedNow += 1;
    if (row.quantity > 1) multiQuantityListings += 1;

    statements.push(
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
        VALUES (?, ?, ?, 'ebay', ?, ?, 'USD', ?, ?, NULL, 'active', ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          inventory_item_id = excluded.inventory_item_id,
          ebay_listing_id = excluded.ebay_listing_id,
          marketplace_provider = 'ebay',
          external_listing_id = excluded.external_listing_id,
          price_cents = excluded.price_cents,
          quantity = excluded.quantity,
          listed_at = COALESCE(listings.listed_at, excluded.listed_at),
          ended_at = NULL,
          status = 'active',
          view_item_url = excluded.view_item_url,
          updated_at = excluded.updated_at
      `).bind(
        listingId,
        inventoryId,
        row.itemId,
        row.itemId,
        row.priceCents,
        row.quantity,
        listedAt,
        `https://www.ebay.com/itm/${row.itemId}`,
        now,
        now,
        workspaceId
      )
    );

    listingByItemId.set(row.itemId, {
      id: listingId,
      inventoryItemId: inventoryId,
      externalListingId: row.itemId
    });
  }

  await runStatements(db, statements);

  let skusObserved = 0;
  for (const sku of importedSkus) {
    const parsed = await observeSku(db, workspaceId, sku);
    if (parsed) skusObserved += 1;
  }

  return {
    batchId,
    rowsSeen: rows.length,
    listingsImported: normalized.length,
    inventoryCreated,
    inventoryMatched,
    skusObserved,
    categoriesInferred,
    otherCategoryCount,
    ageTrackingStartedNow,
    multiQuantityListings
  };
}
