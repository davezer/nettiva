export type FinanceCategory =
  | 'sale'
  | 'selling_fee'
  | 'shipping_label'
  | 'refund'
  | 'dispute'
  | 'payout'
  | 'transfer'
  | 'other_fee'
  | 'adjustment'
  | 'withheld_tax'
  | 'reserve'
  | 'purchase'
  | 'other';

const DEBIT_CATEGORIES = new Set<FinanceCategory>([
  'selling_fee',
  'shipping_label',
  'refund',
  'dispute',
  'other_fee',
  'withheld_tax',
  'purchase'
]);

export const PNL_CATEGORIES = new Set<FinanceCategory>([
  'selling_fee',
  'shipping_label',
  'refund',
  'dispute',
  'other_fee',
  'adjustment',
  'withheld_tax',
  'purchase'
]);

export function moneyToCents(value?: string | null) {
  if (!value || value === '--') return 0;
  const cleaned = value.replace(/[$,\s]/g, '');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

export function signedApiAmountCents(
  value: string | undefined,
  bookingEntry: string | undefined,
  category: FinanceCategory
) {
  const raw = moneyToCents(value);
  if (raw < 0) return raw;

  const entry = bookingEntry?.toUpperCase();
  if (entry === 'DEBIT') return -Math.abs(raw);
  if (entry === 'CREDIT') return Math.abs(raw);

  return DEBIT_CATEGORIES.has(category) ? -Math.abs(raw) : raw;
}

export function categoryFromCsv(type?: string | null): FinanceCategory {
  switch ((type ?? '').trim().toLowerCase()) {
    case 'order':
      return 'sale';
    case 'refund':
      return 'refund';
    case 'claim':
    case 'payment dispute':
      return 'dispute';
    case 'shipping label':
      return 'shipping_label';
    case 'payout':
    case 'secondary payout':
      return 'payout';
    case 'transfer':
      return 'transfer';
    case 'other fee':
    case 'charge':
      return 'other_fee';
    case 'adjustment':
      return 'adjustment';
    case 'withheld tax':
      return 'withheld_tax';
    case 'reserve':
      return 'reserve';
    case 'purchase':
      return 'purchase';
    default:
      return 'other';
  }
}

export function categoryFromApi(transactionType?: string, feeType?: string): FinanceCategory {
  if (feeType) return 'selling_fee';

  const type = (transactionType ?? '').toUpperCase().replace(/[\s-]+/g, '_');

  if (type.includes('SHIPPING') && type.includes('LABEL')) return 'shipping_label';
  if (type.includes('REFUND')) return 'refund';
  if (type.includes('DISPUTE') || type.includes('CLAIM')) return 'dispute';
  if (type.includes('PAYOUT') || type.includes('WITHDRAWAL')) return 'payout';
  if (type.includes('TRANSFER')) return 'transfer';
  if (type.includes('WITHHELD') && type.includes('TAX')) return 'withheld_tax';
  if (type.includes('RESERVE')) return 'reserve';
  if (type.includes('PURCHASE')) return 'purchase';
  if (type.includes('ADJUSTMENT') || type === 'CREDIT') return 'adjustment';
  if (type.includes('FEE') || type.includes('CHARGE')) return 'other_fee';
  if (type.includes('SALE')) return 'sale';

  return 'other';
}

export function stableOrderItemId(orderId: string, ebayItemId?: string | null, fallback?: string | null) {
  const key = ebayItemId || fallback || 'unknown';
  return `orderitem:${orderId}:${key}`;
}

export function csvLineItemRef(orderId: string, ebayItemId?: string | null, fallback?: string | null) {
  const key = ebayItemId || fallback || 'unknown';
  return `csv:${orderId}:${key}`;
}

export function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'fee';
}
