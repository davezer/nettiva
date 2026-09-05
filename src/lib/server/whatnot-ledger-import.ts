import { moneyToCents } from './finance-normalize';
import { workspaceEntityId } from './workspace';

type CsvRecord = Record<string, string>;

export type WhatnotLedgerImportResult = {
  batchId: string;
  rowsSeen: number;
  rowsImported: number;
  completedRows: number;
  pendingRows: number;
  salesEntries: number;
  tipEntries: number;
  payoutEntries: number;
  salesEarningsCents: number;
  tipIncomeCents: number;
  payoutCents: number;
  netBalanceChangeCents: number;
};

const REQUIRED_HEADERS = [
  'Created Date',
  'Amount',
  'Listing ID',
  'Order ID',
  'Message',
  'Status',
  'Transaction Type',
  'Completed Date'
] as const;

const SUPPORTED_TYPES = new Set(['SALES', 'TIP', 'PAYOUT']);

function clean(value?: string | null) {
  const trimmed = value?.trim() ?? '';
  return trimmed ? trimmed : null;
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

function ledgerRows(text: string): CsvRecord[] {
  const parsed = parseCsv(text.replace(/^\uFEFF/, ''));
  const headerIndex = parsed.findIndex((row) =>
    row.includes('Created Date') &&
    row.includes('Amount') &&
    row.includes('Transaction Type')
  );

  if (headerIndex < 0) {
    throw new Error(
      'This does not look like a Whatnot Ledger export. Export the Ledger CSV from Whatnot Seller Hub.'
    );
  }

  const headers = parsed[headerIndex].map((header) => header.trim());
  const missing = REQUIRED_HEADERS.filter((header) => !headers.includes(header));
  if (missing.length) {
    throw new Error(`Whatnot Ledger export is missing columns: ${missing.join(', ')}`);
  }

  return parsed
    .slice(headerIndex + 1)
    .filter((row) => row.some((cell) => cell.trim() !== ''))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])));
}

function localLedgerDate(value?: string | null) {
  const raw = clean(value);
  if (!raw) return null;

  const match = raw.match(
    /^([A-Za-z]{3})\s+(\d{1,2}),\s+(\d{4}),\s+(\d{1,2}):(\d{2}):(\d{2})\s+(AM|PM)$/i
  );

  if (!match) {
    const parsed = Date.parse(raw);
    if (!Number.isFinite(parsed)) {
      throw new Error(`Could not parse Whatnot Ledger date: ${raw}`);
    }
    return new Date(parsed).toISOString();
  }

  const months: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
  };

  const month = months[match[1].toLowerCase()];
  if (!month) throw new Error(`Could not parse Whatnot Ledger month: ${raw}`);

  let hour = Number(match[4]);
  const meridiem = match[7].toUpperCase();
  if (meridiem === 'AM' && hour === 12) hour = 0;
  if (meridiem === 'PM' && hour !== 12) hour += 12;

  return [
    match[3],
    String(month).padStart(2, '0'),
    String(Number(match[2])).padStart(2, '0')
  ].join('-') + 'T' + [
    String(hour).padStart(2, '0'),
    match[5],
    match[6]
  ].join(':');
}

async function stableLedgerKey(row: CsvRecord) {
  // Status and Completed Date are deliberately excluded. If a pending ledger
  // entry later becomes completed, a new export updates the same identity.
  const identity = [
    clean(row['Transaction Type'])?.toUpperCase() ?? '',
    clean(row['Created Date']) ?? '',
    String(moneyToCents(row.Amount)),
    clean(row['Listing ID']) ?? '',
    clean(row['Order ID']) ?? '',
    clean(row.Message) ?? ''
  ].join('|');

  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(identity)
  );

  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 40);
}

function bookingEntry(amountCents: number) {
  return amountCents < 0 ? 'DEBIT' : 'CREDIT';
}

export async function importWhatnotLedgerCsv(
  db: D1Database,
  text: string,
  filename: string | null,
  workspaceId: string
): Promise<WhatnotLedgerImportResult> {
  const rows = ledgerRows(text);
  if (!rows.length) throw new Error('The Whatnot Ledger export is empty.');

  const unsupported = [...new Set(
    rows
      .map((row) => clean(row['Transaction Type'])?.toUpperCase())
      .filter((type): type is string => Boolean(type && !SUPPORTED_TYPES.has(type)))
  )];

  if (unsupported.length) {
    throw new Error(
      `This Whatnot Ledger contains transaction types Sellquity does not support yet: ${unsupported.join(', ')}`
    );
  }

  const batchId = crypto.randomUUID();
  const now = new Date().toISOString();

  let rowsImported = 0;
  let completedRows = 0;
  let pendingRows = 0;
  let salesEntries = 0;
  let tipEntries = 0;
  let payoutEntries = 0;
  let financeTransactionsImported = 0;
  let salesEarningsCents = 0;
  let tipIncomeCents = 0;
  let payoutCents = 0;
  let netBalanceChangeCents = 0;

  await db.prepare(`
    INSERT INTO import_batches (
      workspace_id, id, source, filename, rows_seen, imported_at, marketplace_provider
    )
    VALUES (?, ?, 'whatnot_ledger_csv', ?, ?, ?, 'whatnot')
  `).bind(workspaceId, batchId, filename, rows.length, now).run();

  for (const row of rows) {
    const transactionType = clean(row['Transaction Type'])?.toUpperCase();
    if (!transactionType) throw new Error('A Whatnot Ledger row is missing Transaction Type.');

    const amountCents = moneyToCents(row.Amount);
    const status = clean(row.Status)?.toLowerCase() ?? 'unknown';
    const createdAt = localLedgerDate(row['Created Date']);
    const completedAt = localLedgerDate(row['Completed Date']);
    const orderId = clean(row['Order ID']);
    const listingId = clean(row['Listing ID']);
    const description = clean(row.Message);
    const externalKey = await stableLedgerKey(row);
    const balanceId = workspaceEntityId(
      workspaceId,
      `whatnot:balance:${externalKey}`
    );

    if (!createdAt) {
      throw new Error('A Whatnot Ledger row is missing Created Date.');
    }

    await db.prepare(`
      INSERT INTO marketplace_balance_entries (
        id,
        workspace_id,
        provider,
        external_key,
        transaction_type,
        status,
        amount_cents,
        currency,
        created_at_external,
        completed_at_external,
        external_order_id,
        external_listing_id,
        description,
        import_batch_id,
        created_at,
        updated_at
      )
      VALUES (
        ?, ?, 'whatnot', ?, ?, ?, ?, 'USD', ?, ?, ?, ?, ?, ?, ?, ?
      )
      ON CONFLICT(workspace_id, provider, external_key) DO UPDATE SET
        transaction_type = excluded.transaction_type,
        status = excluded.status,
        amount_cents = excluded.amount_cents,
        currency = excluded.currency,
        created_at_external = excluded.created_at_external,
        completed_at_external = excluded.completed_at_external,
        external_order_id = excluded.external_order_id,
        external_listing_id = excluded.external_listing_id,
        description = excluded.description,
        import_batch_id = excluded.import_batch_id,
        updated_at = excluded.updated_at
    `).bind(
      balanceId,
      workspaceId,
      externalKey,
      transactionType,
      status,
      amountCents,
      createdAt,
      completedAt,
      orderId,
      listingId,
      description,
      batchId,
      now,
      now
    ).run();

    rowsImported += 1;

    if (status === 'completed') {
      completedRows += 1;
      netBalanceChangeCents += amountCents;
    } else {
      pendingRows += 1;
    }

    if (transactionType === 'SALES') {
      salesEntries += 1;
      if (status === 'completed') salesEarningsCents += amountCents;
      // SALES stays only in marketplace_balance_entries. Weekly Orders Reports
      // remain the canonical P&L source for gross revenue and selling fees.
      continue;
    }

    if (transactionType === 'TIP') {
      tipEntries += 1;
      if (status === 'completed') tipIncomeCents += amountCents;
    }

    if (transactionType === 'PAYOUT') {
      payoutEntries += 1;
      if (status === 'completed') payoutCents += amountCents;
    }

    // Only completed TIP / PAYOUT rows affect the accounting ledger.
    if (status !== 'completed') continue;

    const category = transactionType === 'TIP' ? 'adjustment' : 'payout';
    const financeExternalId = `whatnot-ledger:${externalKey}`;
    const financeId = workspaceEntityId(
      workspaceId,
      `whatnot:ledger-finance:${externalKey}`
    );
    const transactionDate = completedAt ?? createdAt;

    await db.prepare(`
      INSERT INTO financial_transactions (
        workspace_id,
        id,
        ebay_transaction_id,
        ebay_order_id,
        ebay_line_item_id,
        marketplace_provider,
        external_transaction_id,
        external_order_id,
        external_line_item_id,
        transaction_type,
        amount_cents,
        currency,
        transaction_date,
        booking_entry,
        category,
        source,
        description,
        payout_id,
        reference_id,
        import_batch_id,
        updated_at
      )
      VALUES (
        ?, ?,
        NULL, NULL, NULL,
        'whatnot', ?, NULL, NULL,
        ?, ?, 'USD', ?, ?,
        ?, 'whatnot_ledger_csv', ?,
        ?, ?, ?, ?
      )
      ON CONFLICT(id) DO UPDATE SET
        amount_cents = excluded.amount_cents,
        transaction_date = excluded.transaction_date,
        booking_entry = excluded.booking_entry,
        category = excluded.category,
        description = excluded.description,
        payout_id = excluded.payout_id,
        reference_id = excluded.reference_id,
        import_batch_id = excluded.import_batch_id,
        updated_at = excluded.updated_at
    `).bind(
      workspaceId,
      financeId,
      financeExternalId,
      transactionType,
      amountCents,
      transactionDate,
      bookingEntry(amountCents),
      category,
      description,
      transactionType === 'PAYOUT' ? externalKey : null,
      externalKey,
      batchId,
      now
    ).run();

    financeTransactionsImported += 1;
  }

  await db.prepare(`
    UPDATE import_batches
    SET
      rows_imported = ?,
      transactions_imported = ?,
      marketplace_provider = 'whatnot'
    WHERE id = ?
      AND workspace_id = ?
  `).bind(
    rowsImported,
    financeTransactionsImported,
    batchId,
    workspaceId
  ).run();

  return {
    batchId,
    rowsSeen: rows.length,
    rowsImported,
    completedRows,
    pendingRows,
    salesEntries,
    tipEntries,
    payoutEntries,
    salesEarningsCents,
    tipIncomeCents,
    payoutCents,
    netBalanceChangeCents
  };
}
