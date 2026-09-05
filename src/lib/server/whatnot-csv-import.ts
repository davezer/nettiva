import { moneyToCents } from './finance-normalize';
import { observeSku } from './sku-control';
import { DEFAULT_WORKSPACE_ID, workspaceEntityId } from './workspace';

type CsvRecord = Record<string, string>;

type InventorySkuRow = {
  id: string;
  sku: string | null;
  soldLinks: number;
};

export type WhatnotImportResult = {
  batchId: string;
  rowsSeen: number;
  rowsImported: number;
  ordersImported: number;
  transactionsImported: number;
  feesImported: number;
  sellerShippingImported: number;
  inventoryMatched: number;
  inventoryCreated: number;
  skuConflicts: number;
  giveaways: number;
  unreconciledRows: number;
};

const REQUIRED_HEADERS = [
  'TRANSACTION_TYPE',
  'ORDER_ID',
  'LEDGER_TRANSACTION_ID',
  'ORDER_PLACED_AT_UTC',
  'LISTING_TITLE',
  'TRANSACTION_CURRENCY',
  'TRANSACTION_AMOUNT',
  'POST_COUPON_PRICE',
  'SHIPPING_FEE',
  'COMMISSION_FEE',
  'PAYMENT_PROCESSING_FEE'
] as const;

function clean(value?: string | null) {
  const trimmed = value?.trim() ?? '';
  return !trimmed || trimmed === '--' ? null : trimmed;
}

function optionalMoneyToCents(value?: string | null) {
  const raw = clean(value);
  return raw == null ? null : moneyToCents(raw);
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
  const headerIndex = parsed.findIndex((row) =>
    row.includes('TRANSACTION_TYPE') &&
    row.includes('ORDER_ID') &&
    row.includes('LEDGER_TRANSACTION_ID')
  );

  if (headerIndex < 0) {
    throw new Error(
      'This does not look like a Whatnot Weekly Orders Report. Use Seller Hub → Financials → Statements → Download.'
    );
  }

  const headers = parsed[headerIndex].map((header) => header.trim());
  const missing = REQUIRED_HEADERS.filter((header) => !headers.includes(header));
  if (missing.length) {
    throw new Error(`Whatnot report is missing required columns: ${missing.join(', ')}`);
  }

  return parsed
    .slice(headerIndex + 1)
    .filter((row) => row.some((cell) => cell.trim() !== ''))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])));
}

function utcDate(value?: string | null) {
  const raw = clean(value);
  if (!raw) return new Date().toISOString();

  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)
    ? `${raw.replace(' ', 'T')}Z`
    : raw;

  const timestamp = Date.parse(normalized);
  if (!Number.isFinite(timestamp)) {
    throw new Error(`Could not parse Whatnot UTC timestamp: ${raw}`);
  }
  return new Date(timestamp).toISOString();
}

function bookingEntry(amountCents: number) {
  return amountCents < 0 ? 'DEBIT' : 'CREDIT';
}

function inventoryCategory(productCategory?: string | null) {
  const value = (productCategory ?? '').toLowerCase();
  if (value.includes('baseball') || value.includes('sports card')) return 'baseball_cards';
  if (value.includes('trading card')) return 'trading_cards';
  if (value.includes('action figure') || value.includes('toy')) return 'action_figures';
  if (value.includes('electronic')) return 'electronics';
  if (value.includes('movie') || value.includes('blu-ray') || value.includes('dvd')) return 'movies';
  if (value.includes('video game') || value.includes('gaming')) return 'video_games';
  if (value.includes('collectible')) return 'collectibles';
  return 'other';
}

function chunk<T>(values: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

async function loadSkuRows(
  db: D1Database,
  workspaceId: string,
  skus: string[]
) {
  const map = new Map<string, InventorySkuRow[]>();
  const unique = [...new Set(skus.map((sku) => sku.toUpperCase()))];

  for (const group of chunk(unique, 50)) {
    if (!group.length) continue;
    const placeholders = group.map(() => '?').join(', ');
    const result = await db.prepare(`
      SELECT
        i.id,
        i.sku,
        (
          SELECT COUNT(*)
          FROM order_items oi
          WHERE oi.workspace_id = i.workspace_id
            AND oi.inventory_item_id = i.id
        ) AS soldLinks
      FROM inventory_items i
      WHERE i.workspace_id = ?
        AND i.sku IS NOT NULL
        AND UPPER(i.sku) IN (${placeholders})
    `).bind(workspaceId, ...group).all<InventorySkuRow>();

    for (const row of result.results) {
      const key = row.sku?.toUpperCase();
      if (!key) continue;
      const current = map.get(key) ?? [];
      current.push({
        ...row,
        soldLinks: Number(row.soldLinks ?? 0)
      });
      map.set(key, current);
    }
  }

  return map;
}

async function runStatements(db: D1Database, statements: D1PreparedStatement[]) {
  for (let index = 0; index < statements.length; index += 75) {
    await db.batch(statements.slice(index, index + 75));
  }
}

export async function importWhatnotWeeklyCsv(
  db: D1Database,
  text: string,
  filename: string | null,
  workspaceId: string = DEFAULT_WORKSPACE_ID
): Promise<WhatnotImportResult> {
  const rows = reportRows(text);
  if (!rows.length) throw new Error('The Whatnot Weekly Orders Report is empty.');

  const unsupported = [...new Set(
    rows
      .map((row) => clean(row.TRANSACTION_TYPE))
      .filter((type): type is string => Boolean(type && type !== 'ORDER_EARNINGS'))
  )];

  if (unsupported.length) {
    throw new Error(
      `This Whatnot report contains transaction types Sellquity does not support yet: ${unsupported.join(', ')}`
    );
  }

  const sellerIds = [...new Set(
    rows.map((row) => clean(row.SELLER_ID)).filter((value): value is string => Boolean(value))
  )];
  if (sellerIds.length > 1) {
    throw new Error('This report contains more than one Whatnot seller account.');
  }

  const batchId = crypto.randomUUID();
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  const reportSkus = rows.map((row) => clean(row.SKU)).filter((value): value is string => Boolean(value));
  const skuRows = await loadSkuRows(db, workspaceId, reportSkus);
  const observedSkus = new Set<string>();

  let rowsImported = 0;
  let ordersImported = 0;
  let transactionsImported = 0;
  let feesImported = 0;
  let sellerShippingImported = 0;
  let inventoryMatched = 0;
  let inventoryCreated = 0;
  let skuConflicts = 0;
  let giveaways = 0;
  let unreconciledRows = 0;

  await db.prepare(`
    INSERT INTO import_batches (
      workspace_id, id, source, filename, rows_seen, imported_at, marketplace_provider
    )
    VALUES (?, ?, 'whatnot_weekly_csv', ?, ?, ?, 'whatnot')
  `).bind(workspaceId, batchId, filename, rows.length, now).run();

  const sellerId = sellerIds[0] ?? 'primary';
  const accountId = workspaceEntityId(workspaceId, `marketplace:whatnot:${sellerId}`);

  await db.prepare(`
    INSERT OR IGNORE INTO marketplace_accounts (
      id, workspace_id, provider, external_account_id, display_name,
      status, connection_method, connected_at, last_synced_at, created_at, updated_at
    )
    VALUES (?, ?, 'whatnot', ?, 'Whatnot', 'import_only', 'weekly_csv', ?, ?, ?, ?)
  `).bind(accountId, workspaceId, sellerId, now, now, now, now).run();

  await db.prepare(`
    UPDATE marketplace_accounts
    SET
      display_name = COALESCE(display_name, 'Whatnot'),
      connection_method = CASE WHEN status = 'connected' THEN connection_method ELSE 'weekly_csv' END,
      status = CASE WHEN status = 'connected' THEN status ELSE 'import_only' END,
      last_synced_at = ?,
      updated_at = ?
    WHERE workspace_id = ?
      AND provider = 'whatnot'
      AND external_account_id = ?
  `).bind(now, now, workspaceId, sellerId).run();

  for (const row of rows) {
    const orderId = clean(row.ORDER_ID);
    const ledgerId = clean(row.LEDGER_TRANSACTION_ID);
    if (!orderId || !ledgerId) {
      throw new Error('A Whatnot row is missing ORDER_ID or LEDGER_TRANSACTION_ID.');
    }

    const title = clean(row.LISTING_TITLE) ?? 'Untitled Whatnot item';
    const description = clean(row.TRANSACTION_MESSAGE);
    const sku = clean(row.SKU);
    const placedAt = utcDate(row.ORDER_PLACED_AT_UTC);
    const currency = clean(row.TRANSACTION_CURRENCY) ?? 'USD';
    const quantity = Math.max(1, Number(clean(row.QUANTITY_SOLD) ?? 1) || 1);
    const buyFormat = clean(row.BUY_FORMAT)?.toUpperCase() ?? 'UNKNOWN';
    const isGiveaway = buyFormat === 'GIVEAWAY';

    const originalPriceCents = moneyToCents(row.ORIGINAL_ITEM_PRICE);
    const couponCents = moneyToCents(row.COUPON_COST);
    const postCouponCents = clean(row.POST_COUPON_PRICE) == null
      ? Math.max(0, originalPriceCents - couponCents)
      : moneyToCents(row.POST_COUPON_PRICE);
    const netEarningsCents = moneyToCents(row.TRANSACTION_AMOUNT);
    const commissionCents = Math.abs(moneyToCents(row.COMMISSION_FEE));
    const processingCents = Math.abs(moneyToCents(row.PAYMENT_PROCESSING_FEE));
    const taxCommissionCents = Math.abs(moneyToCents(row.TAX_ON_COMMISSION_FEE));
    const taxProcessingCents = Math.abs(moneyToCents(row.TAX_ON_PAYMENT_PROCESSING_FEE));
    const sellerShippingCents = Math.abs(moneyToCents(row.SHIPPING_FEE));
    const reportCogsCents = optionalMoneyToCents(row.COST_OF_GOODS);

    const calculatedNetCents =
      postCouponCents
      - commissionCents
      - processingCents
      - taxCommissionCents
      - taxProcessingCents
      - sellerShippingCents;
    const reconciliationCents = netEarningsCents - calculatedNetCents;
    if (Math.abs(reconciliationCents) > 1) unreconciledRows += 1;

    const orderDbId = workspaceEntityId(workspaceId, `whatnot:order:${orderId}`);
    const orderItemId = workspaceEntityId(workspaceId, `whatnot:orderitem:${ledgerId}`);
    const placeholderInventoryId = workspaceEntityId(workspaceId, `whatnot:inventory:${ledgerId}`);

    let inventoryId = placeholderInventoryId;
    let placeholderSku: string | null = sku;

    if (sku) {
      observedSkus.add(sku);
      const candidates = skuRows.get(sku.toUpperCase()) ?? [];
      const ownPlaceholder = candidates.find((candidate) => candidate.id === placeholderInventoryId);

      if (ownPlaceholder) {
        inventoryId = ownPlaceholder.id;
        inventoryCreated += 1;
      } else if (candidates.length === 1 && candidates[0].soldLinks === 0) {
        inventoryId = candidates[0].id;
        inventoryMatched += 1;
      } else if (candidates.length === 0) {
        inventoryCreated += 1;
      } else {
        // Do not attach two sales to the same inventory identity. Keep the sale
        // importable and COGS-editable via a deterministic placeholder, but do
        // not duplicate the conflicting SKU on that placeholder.
        placeholderSku = null;
        skuConflicts += 1;
        inventoryCreated += 1;
      }
    } else {
      inventoryCreated += 1;
    }

    statements.push(db.prepare(`
      INSERT INTO orders (
        workspace_id, id,
        ebay_order_id, marketplace_provider, external_order_id,
        created_at_ebay, status, gross_total_cents, currency, updated_at
      )
      VALUES (?, ?, NULL, 'whatnot', ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        marketplace_provider = 'whatnot',
        external_order_id = excluded.external_order_id,
        created_at_ebay = excluded.created_at_ebay,
        status = excluded.status,
        gross_total_cents = excluded.gross_total_cents,
        currency = excluded.currency,
        updated_at = excluded.updated_at
    `).bind(
      workspaceId,
      orderDbId,
      orderId,
      placedAt,
      isGiveaway ? 'GIVEAWAY' : 'COMPLETED',
      postCouponCents,
      currency,
      now
    ));

    if (inventoryId === placeholderInventoryId) {
      statements.push(db.prepare(`
        INSERT INTO inventory_items (
          workspace_id, id, title, sku, ebay_item_id, purchase_cost_cents,
          source, status, inventory_category, updated_at
        )
        VALUES (?, ?, ?, ?, NULL, ?, 'whatnot_weekly_csv', 'sold', ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          sku = COALESCE(inventory_items.sku, excluded.sku),
          purchase_cost_cents = COALESCE(inventory_items.purchase_cost_cents, excluded.purchase_cost_cents),
          source = COALESCE(inventory_items.source, excluded.source),
          status = 'sold',
          inventory_category = CASE
            WHEN inventory_items.inventory_category = 'other' THEN excluded.inventory_category
            ELSE inventory_items.inventory_category
          END,
          updated_at = excluded.updated_at
      `).bind(
        workspaceId,
        inventoryId,
        title,
        placeholderSku,
        reportCogsCents,
        inventoryCategory(row.PRODUCT_CATEGORY),
        now
      ));
    } else {
      statements.push(db.prepare(`
        UPDATE inventory_items
        SET
          status = 'sold',
          purchase_cost_cents = COALESCE(purchase_cost_cents, ?),
          updated_at = ?
        WHERE workspace_id = ?
          AND id = ?
      `).bind(reportCogsCents, now, workspaceId, inventoryId));
    }

    statements.push(db.prepare(`
      INSERT INTO order_items (
        workspace_id, id, order_id, inventory_item_id,
        ebay_line_item_id, ebay_item_id,
        marketplace_provider, external_line_item_id, external_item_id,
        title, quantity, sale_price_cents, shipping_charged_cents, sold_at, updated_at
      )
      VALUES (?, ?, ?, ?, NULL, NULL, 'whatnot', ?, NULL, ?, ?, ?, 0, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        order_id = excluded.order_id,
        inventory_item_id = excluded.inventory_item_id,
        marketplace_provider = 'whatnot',
        external_line_item_id = excluded.external_line_item_id,
        title = excluded.title,
        quantity = excluded.quantity,
        sale_price_cents = excluded.sale_price_cents,
        shipping_charged_cents = 0,
        sold_at = excluded.sold_at,
        updated_at = excluded.updated_at
    `).bind(
      workspaceId,
      orderItemId,
      orderDbId,
      inventoryId,
      ledgerId,
      title,
      quantity,
      postCouponCents,
      placedAt,
      now
    ));

    const pushFinance = (
      suffix: string,
      transactionType: string,
      amountCents: number,
      category: string,
      feeType: string | null,
      financeDescription: string | null
    ) => {
      const externalTransactionId = `${ledgerId}:${suffix}`;
      statements.push(db.prepare(`
        INSERT INTO financial_transactions (
          workspace_id, id,
          ebay_transaction_id, ebay_order_id, ebay_line_item_id,
          marketplace_provider, external_transaction_id, external_order_id, external_line_item_id,
          transaction_type, amount_cents, currency, transaction_date, fee_type,
          booking_entry, category, source, description, reference_id,
          gross_amount_cents, item_subtotal_cents, shipping_charged_cents,
          import_batch_id, updated_at
        )
        VALUES (
          ?, ?,
          NULL, NULL, NULL,
          'whatnot', ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, 'whatnot_weekly_csv', ?, ?,
          ?, ?, 0,
          ?, ?
        )
        ON CONFLICT(id) DO UPDATE SET
          marketplace_provider = 'whatnot',
          external_order_id = excluded.external_order_id,
          external_line_item_id = excluded.external_line_item_id,
          transaction_type = excluded.transaction_type,
          amount_cents = excluded.amount_cents,
          currency = excluded.currency,
          transaction_date = excluded.transaction_date,
          fee_type = excluded.fee_type,
          booking_entry = excluded.booking_entry,
          category = excluded.category,
          description = excluded.description,
          reference_id = excluded.reference_id,
          gross_amount_cents = excluded.gross_amount_cents,
          item_subtotal_cents = excluded.item_subtotal_cents,
          import_batch_id = excluded.import_batch_id,
          updated_at = excluded.updated_at
      `).bind(
        workspaceId,
        workspaceEntityId(workspaceId, `whatnot:finance:${externalTransactionId}`),
        externalTransactionId,
        orderId,
        ledgerId,
        transactionType,
        amountCents,
        currency,
        placedAt,
        feeType,
        bookingEntry(amountCents),
        category,
        financeDescription,
        ledgerId,
        postCouponCents,
        postCouponCents,
        batchId,
        now
      ));
      transactionsImported += 1;
    };

    // The Weekly Orders report's TRANSACTION_AMOUNT is net seller earnings.
    // Store it for ledger/reconciliation, but category=sale keeps it out of P&L.
    pushFinance(
      'net',
      'ORDER_EARNINGS',
      netEarningsCents,
      'sale',
      null,
      description ?? `Whatnot earnings · ${title}`
    );

    const feeRows: Array<[string, number, string]> = [
      ['commission', commissionCents, 'Whatnot commission'],
      ['processing', processingCents, 'Whatnot payment processing'],
      ['tax-commission', taxCommissionCents, 'Tax on Whatnot commission'],
      ['tax-processing', taxProcessingCents, 'Tax on Whatnot payment processing']
    ];

    for (const [suffix, cents, label] of feeRows) {
      if (!cents) continue;
      pushFinance(suffix, 'SELLING_FEE', -cents, 'selling_fee', label, label);
      feesImported += 1;
    }

    if (sellerShippingCents) {
      pushFinance(
        'seller-shipping',
        'SELLER_PAID_SHIPPING',
        -sellerShippingCents,
        'shipping_label',
        'Seller-paid shipping',
        'Whatnot seller-paid shipping'
      );
      sellerShippingImported += 1;
    }

    if (Math.abs(reconciliationCents) > 1) {
      pushFinance(
        'reconciliation',
        'RECONCILIATION_ADJUSTMENT',
        reconciliationCents,
        'adjustment',
        null,
        'Whatnot weekly report reconciliation difference'
      );
    }

    if (isGiveaway) giveaways += 1;
    rowsImported += 1;
    ordersImported += 1;
  }

  await runStatements(db, statements);

  for (const sku of observedSkus) {
    await observeSku(db, workspaceId, sku);
  }

  await db.prepare(`
    UPDATE import_batches
    SET
      rows_imported = ?,
      orders_imported = ?,
      transactions_imported = ?,
      marketplace_provider = 'whatnot'
    WHERE id = ?
      AND workspace_id = ?
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
    feesImported,
    sellerShippingImported,
    inventoryMatched,
    inventoryCreated,
    skuConflicts,
    giveaways,
    unreconciledRows
  };
}
