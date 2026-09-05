const SKU_PATTERN = /^([A-Z0-9]{2,8})-(\d{1,8})$/i;
const SKU_EXTRACT_PATTERN = /\b[A-Z0-9]{2,8}-\d{1,8}\b/gi;

export type ParsedSku = { sku: string; prefix: string; sequence: number };

export function parseSku(value?: string | null): ParsedSku | null {
  if (!value) return null;
  const sku = value.trim().toUpperCase();
  const match = sku.match(SKU_PATTERN);
  if (!match) return null;
  const sequence = Number(match[2]);
  if (!Number.isInteger(sequence) || sequence < 0) return null;
  return {
    sku: `${match[1].toUpperCase()}-${match[2].padStart(4, '0')}`,
    prefix: match[1].toUpperCase(),
    sequence
  };
}

export function extractSkus(value: string, limit = 500) {
  const matches = value.toUpperCase().match(SKU_EXTRACT_PATTERN) ?? [];
  const unique = new Map<string, ParsedSku>();

  for (const raw of matches) {
    const parsed = parseSku(raw);
    if (!parsed) continue;
    unique.set(parsed.sku, parsed);
    if (unique.size >= limit) break;
  }

  return [...unique.values()];
}

export function categoryFromSku(value?: string | null) {
  const prefix = parseSku(value)?.prefix;

  if (prefix === 'AFG') return 'action_figures';

  // SPC is the new default. BSC/BBC remain recognized forever so existing
  // inventory keeps its durable SKU identity.
  if (prefix === 'SPC' || prefix === 'BSC' || prefix === 'BBC') return 'baseball_cards';

  if (prefix === 'ELC' || prefix === 'ELE') return 'electronics';
  if (prefix === 'MOV' || prefix === 'MED') return 'movies';
  if (prefix === 'VGM') return 'video_games';
  if (prefix === 'TCG') return 'trading_cards';
  if (prefix === 'APP') return 'clothing';
  if (prefix === 'TOY') return 'toys_games';
  if (prefix === 'COL') return 'collectibles';
  if (prefix === 'HBK') return 'home_bar_kitchen';
  if (prefix === 'BKS') return 'books_print';
  if (prefix === 'TLH') return 'tools_hardware';
  return 'other';
}

async function observedMax(db: D1Database, workspaceId: string, prefix: string) {
  const rows = await db.prepare(`
    SELECT sku FROM inventory_items
    WHERE workspace_id = ? AND sku IS NOT NULL AND UPPER(sku) LIKE ?
    UNION ALL
    SELECT sku FROM sku_reservations
    WHERE workspace_id = ? AND UPPER(sku) LIKE ?
  `).bind(
    workspaceId,
    `${prefix}-%`,
    workspaceId,
    `${prefix}-%`
  ).all<{ sku: string }>();

  let max = 0;

  for (const row of rows.results) {
    const parsed = parseSku(row.sku);
    if (parsed?.prefix === prefix && parsed.sequence > max) max = parsed.sequence;
  }

  return max;
}

export async function observeSku(db: D1Database, workspaceId: string, sku: string) {
  const parsed = parseSku(sku);
  if (!parsed) return null;

  const now = new Date().toISOString();

  await db.prepare(`
    INSERT OR IGNORE INTO sku_sequences (
      workspace_id,
      prefix,
      last_number,
      updated_at
    )
    VALUES (?, ?, 0, ?)
  `).bind(
    workspaceId,
    parsed.prefix,
    now
  ).run();

  await db.prepare(`
    UPDATE sku_sequences
    SET
      last_number = CASE WHEN last_number < ? THEN ? ELSE last_number END,
      updated_at = ?
    WHERE workspace_id = ? AND prefix = ?
  `).bind(
    parsed.sequence,
    parsed.sequence,
    now,
    workspaceId,
    parsed.prefix
  ).run();

  return parsed;
}

export async function allocateSkuRange(
  db: D1Database,
  workspaceId: string,
  prefixValue: string,
  quantity: number
) {
  const prefix = prefixValue.trim().toUpperCase();

  if (!/^[A-Z0-9]{2,8}$/.test(prefix)) {
    throw new Error('Auto SKU prefix must be 2–8 letters or numbers.');
  }

  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
    throw new Error('Quantity must be between 1 and 50.');
  }

  const knownMax = await observedMax(db, workspaceId, prefix);
  const existing = await db.prepare(`
    SELECT last_number AS lastNumber
    FROM sku_sequences
    WHERE workspace_id = ? AND prefix = ?
  `).bind(
    workspaceId,
    prefix
  ).first<{ lastNumber: number }>();

  const current = Math.max(Number(existing?.lastNumber ?? 0), knownMax);
  const first = current + 1;
  const last = current + quantity;
  const now = new Date().toISOString();

  await db.prepare(`
    INSERT OR IGNORE INTO sku_sequences (
      workspace_id,
      prefix,
      last_number,
      updated_at
    )
    VALUES (?, ?, 0, ?)
  `).bind(
    workspaceId,
    prefix,
    now
  ).run();

  await db.prepare(`
    UPDATE sku_sequences
    SET last_number = ?, updated_at = ?
    WHERE workspace_id = ? AND prefix = ? AND last_number <= ?
  `).bind(
    last,
    now,
    workspaceId,
    prefix,
    current
  ).run();

  const verified = await db.prepare(`
    SELECT last_number AS lastNumber
    FROM sku_sequences
    WHERE workspace_id = ? AND prefix = ?
  `).bind(
    workspaceId,
    prefix
  ).first<{ lastNumber: number }>();

  if (Number(verified?.lastNumber ?? 0) !== last) {
    const retryCurrent = Math.max(
      Number(verified?.lastNumber ?? 0),
      await observedMax(db, workspaceId, prefix)
    );
    const retryLast = retryCurrent + quantity;

    await db.prepare(`
      UPDATE sku_sequences
      SET last_number = ?, updated_at = ?
      WHERE workspace_id = ? AND prefix = ? AND last_number = ?
    `).bind(
      retryLast,
      now,
      workspaceId,
      prefix,
      retryCurrent
    ).run();

    const retryVerified = await db.prepare(`
      SELECT last_number AS lastNumber
      FROM sku_sequences
      WHERE workspace_id = ? AND prefix = ?
    `).bind(
      workspaceId,
      prefix
    ).first<{ lastNumber: number }>();

    if (Number(retryVerified?.lastNumber ?? 0) !== retryLast) {
      throw new Error('SKU sequence changed while allocating. Please try again.');
    }

    return Array.from(
      { length: quantity },
      (_, index) =>
        `${prefix}-${String(retryCurrent + 1 + index).padStart(4, '0')}`
    );
  }

  return Array.from(
    { length: quantity },
    (_, index) => `${prefix}-${String(first + index).padStart(4, '0')}`
  );
}
