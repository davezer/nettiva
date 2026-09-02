export type ActiveCsvItem = {
  itemId: string;
  title: string;
  sku: string | null;
  quantity: number;
  currency: string;
  priceCents: number;
  listedAt: string | null;
  endAt: string | null;
  conditionName: string | null;
};

export type OrderCsvLine = {
  orderId: string;
  lineIdentity: string;
  csvLineItemId: string;
  itemId: string;
  title: string;
  sku: string | null;
  quantity: number;
  salePriceCents: number;
  shippingChargedCents: number;
  orderTotalCents: number;
  currency: string;
  soldAt: string;
};

export type ParsedEbayCsv = {
  type: 'active-listings' | 'orders';
  rowsSeen: number;
  validRows: number;
  skippedRows: number;
  warnings: string[];
  activeListings: ActiveCsvItem[];
  orders: OrderCsvLine[];
};

function parseCsvRows(input: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (character === '"') {
      if (quoted && input[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      row.push(value);
      value = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && input[index + 1] === '\n') index += 1;
      row.push(value);
      if (row.some((cell) => cell.trim() !== '')) rows.push(row);
      row = [];
      value = '';
    } else {
      value += character;
    }
  }

  if (quoted) throw new Error('The CSV contains an unterminated quoted value.');
  if (value || row.length) {
    row.push(value);
    if (row.some((cell) => cell.trim() !== '')) rows.push(row);
  }
  return rows;
}

const normalized = (value: string) => value.replace(/^\uFEFF/, '').trim().toLowerCase();

function rowObject(headers: string[], row: string[]) {
  return Object.fromEntries(headers.map((header, index) => [normalized(header), row[index]?.trim() ?? '']));
}

function money(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const negative = trimmed.startsWith('(') && trimmed.endsWith(')');
  const numeric = Number(trimmed.replace(/[$,()\s]/g, ''));
  return Number.isFinite(numeric) ? Math.round(numeric * 100) * (negative ? -1 : 1) : null;
}

function positiveInteger(value: string, fallback = 1) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const months: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
};

function ebayDate(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const short = trimmed.match(/^([A-Za-z]{3})-(\d{2})-(\d{2})$/);
  if (short) {
    const month = months[short[1].toLowerCase()];
    if (month == null) return null;
    const year = 2000 + Number(short[3]);
    return new Date(Date.UTC(year, month, Number(short[2]))).toISOString();
  }
  const timestamp = Date.parse(trimmed);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

export function parseEbayCsv(input: string): ParsedEbayCsv {
  const rows = parseCsvRows(input.replace(/^\uFEFF/, ''));
  const headerIndex = rows.findIndex((row) => {
    const names = new Set(row.map(normalized));
    return names.has('item number') && (names.has('order number') || names.has('available quantity'));
  });
  if (headerIndex < 0) throw new Error('This does not look like an eBay Orders or Active Listings report.');

  const headers = rows[headerIndex];
  const headerNames = new Set(headers.map(normalized));
  const dataRows = rows.slice(headerIndex + 1);
  const warnings: string[] = [];

  if (headerNames.has('order number')) {
    const orders: OrderCsvLine[] = [];
    for (const row of dataRows) {
      const record = rowObject(headers, row);
      const orderId = record['order number'];
      const itemId = record['item number'];
      const title = record['item title'];
      const identity = record['transaction id'] || record['sales record number'];
      const soldAt = ebayDate(record['sale date']);
      const salePriceCents = money(record['sold for']);
      if (!orderId || !itemId || !title || !identity || !soldAt || salePriceCents == null) continue;

      const shippingChargedCents = money(record['shipping and handling']) ?? 0;
      orders.push({
        orderId,
        lineIdentity: `ebay-line:${itemId}:${identity}`,
        csvLineItemId: `csv:${itemId}:${identity}`,
        itemId,
        title,
        sku: record['custom label'] || null,
        quantity: positiveInteger(record.quantity),
        salePriceCents,
        shippingChargedCents,
        orderTotalCents: money(record['total price']) ?? salePriceCents + shippingChargedCents,
        currency: 'USD',
        soldAt
      });
    }
    if (orders.length) warnings.push('Seller fees are not included in the Orders report. Profit remains estimated until the Finances API syncs.');
    return {
      type: 'orders',
      rowsSeen: dataRows.length,
      validRows: orders.length,
      skippedRows: dataRows.length - orders.length,
      warnings,
      activeListings: [],
      orders
    };
  }

  const activeListings: ActiveCsvItem[] = [];
  for (const row of dataRows) {
    const record = rowObject(headers, row);
    const itemId = record['item number'];
    const title = record.title;
    const priceCents = money(record['current price']) ?? money(record['start price']);
    if (!itemId || !title || priceCents == null) continue;
    activeListings.push({
      itemId,
      title,
      sku: record['custom label (sku)'] || null,
      quantity: positiveInteger(record['available quantity']),
      currency: record.currency || 'USD',
      priceCents,
      listedAt: ebayDate(record['start date']),
      endAt: ebayDate(record['end date']),
      conditionName: record.condition || null
    });
  }

  return {
    type: 'active-listings',
    rowsSeen: dataRows.length,
    validRows: activeListings.length,
    skippedRows: dataRows.length - activeListings.length,
    warnings,
    activeListings,
    orders: []
  };
}
