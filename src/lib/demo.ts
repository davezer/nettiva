import type {
  AccountingTransactionRow,
  DashboardData,
  InventoryRow,
  SaleRow
} from '$lib/types';

const now = Date.now();
const daysAgo = (days: number) => new Date(now - days * 86_400_000).toISOString();

const inventory: InventoryRow[] = [
  { id: 'demo-1', title: '2024 Topps Chrome Aaron Judge /150', sku: 'CARD-A14', ebayItemId: 'demo-1001', imageUrl: null, conditionName: null, purchasedAt: null, category: 'other', costCents: 1200, source: 'Card show', location: 'A-14', status: 'active', listPriceCents: 3999, listedAt: daysAgo(43), ageDays: 43 },
  { id: 'demo-2', title: 'Nintendo Game Boy Color — Atomic Purple', sku: 'GAME-B07', ebayItemId: 'demo-1002', imageUrl: null, conditionName: null, purchasedAt: null, category: 'other', costCents: 3800, source: 'Marketplace', location: 'B-07', status: 'active', listPriceCents: 8999, listedAt: daysAgo(96), ageDays: 96 },
  { id: 'demo-3', title: 'Vintage Nike ACG Fleece Pullover XL', sku: 'CLOTH-C22', ebayItemId: 'demo-1003', imageUrl: null, conditionName: null, purchasedAt: null, category: 'other', costCents: null, source: 'Goodwill', location: 'C-22', status: 'active', listPriceCents: 6499, listedAt: daysAgo(18), ageDays: 18 },
  { id: 'demo-4', title: 'Sony Walkman WM-FX195 Cassette Player', sku: 'ELEC-D03', ebayItemId: 'demo-1004', imageUrl: null, conditionName: null, purchasedAt: null, category: 'other', costCents: 700, source: 'Yard sale', location: 'D-03', status: 'unlisted', listPriceCents: null, listedAt: null, ageDays: 0 },
  { id: 'demo-5', title: '2023 Bowman Chrome Gunnar Henderson Auto', sku: 'CARD-A09', ebayItemId: 'demo-1005', imageUrl: null, conditionName: null, purchasedAt: null, category: 'other', costCents: 2400, source: 'Card show', location: 'SOLD', status: 'sold', listPriceCents: 7499, listedAt: daysAgo(51), ageDays: 51 },
  { id: 'demo-6', title: 'Sealed Pokémon Crown Zenith Elite Trainer Box', sku: 'CARD-A10', ebayItemId: 'demo-1006', imageUrl: null, conditionName: null, purchasedAt: null, category: 'other', costCents: null, source: 'Retail', location: 'SOLD', status: 'sold', listPriceCents: null, listedAt: daysAgo(20), ageDays: 20 }
];

const sales: SaleRow[] = [
  {
    id: 'sale-1', inventoryItemId: 'demo-5', ebayOrderId: 'demo-order-1',
    ebayLineItemId: 'demo-line-1', ebayItemId: 'demo-1005',
    title: '2023 Bowman Chrome Gunnar Henderson Auto', soldAt: daysAgo(2),
    salePriceCents: 7499, shippingChargedCents: 499, sellingFeesCents: 1162,
    shippingLabelCents: 400, refundsCents: 0, disputesCents: 0,
    otherAdjustmentsCents: 0, pnlAdjustmentsCents: -1562,
    costsAndFeesCents: 1562, cogsCents: 2400, netProfitCents: 4036,
    margin: 50.5, roi: 168.2
  },
  {
    id: 'sale-2', inventoryItemId: 'demo-6', ebayOrderId: 'demo-order-2',
    ebayLineItemId: 'demo-line-2', ebayItemId: 'demo-1006',
    title: 'Sealed Pokémon Crown Zenith Elite Trainer Box', soldAt: daysAgo(5),
    salePriceCents: 6499, shippingChargedCents: 0, sellingFeesCents: 871,
    shippingLabelCents: 440, refundsCents: 0, disputesCents: 0,
    otherAdjustmentsCents: 0, pnlAdjustmentsCents: -1311,
    costsAndFeesCents: 1311, cogsCents: null, netProfitCents: 5188,
    margin: 79.8, roi: null
  }
];

const transactions: AccountingTransactionRow[] = [
  { id: 'demo-expense-1', transactionDate: daysAgo(3), category: 'business_expense', transactionType: 'MANUAL_EXPENSE', amountCents: -1299, currency: 'USD', ebayOrderId: null, ebayLineItemId: null, feeType: null, description: 'Thermal shipping labels', source: 'manual', payoutId: null, referenceId: null, expenseCategory: 'shipping_supplies', memo: '4x6 label roll' },
  { id: 'demo-fee-1', transactionDate: daysAgo(2), category: 'selling_fee', transactionType: 'SELLING_FEE', amountCents: -1162, currency: 'USD', ebayOrderId: 'demo-order-1', ebayLineItemId: 'demo-line-1', feeType: 'Final value fee', description: 'Final value fee', source: 'demo', payoutId: null, referenceId: null, expenseCategory: null, memo: null },
  { id: 'demo-label-1', transactionDate: daysAgo(2), category: 'shipping_label', transactionType: 'SHIPPING_LABEL', amountCents: -400, currency: 'USD', ebayOrderId: 'demo-order-1', ebayLineItemId: 'demo-line-1', feeType: null, description: 'USPS label', source: 'demo', payoutId: null, referenceId: null, expenseCategory: null, memo: null },
  { id: 'demo-fee-2', transactionDate: daysAgo(5), category: 'selling_fee', transactionType: 'SELLING_FEE', amountCents: -871, currency: 'USD', ebayOrderId: 'demo-order-2', ebayLineItemId: 'demo-line-2', feeType: 'Final value fee', description: 'Final value fee', source: 'demo', payoutId: null, referenceId: null, expenseCategory: null, memo: null },
  { id: 'demo-label-2', transactionDate: daysAgo(5), category: 'shipping_label', transactionType: 'SHIPPING_LABEL', amountCents: -440, currency: 'USD', ebayOrderId: 'demo-order-2', ebayLineItemId: 'demo-line-2', feeType: null, description: 'USPS label', source: 'demo', payoutId: null, referenceId: null, expenseCategory: null, memo: null },
  { id: 'demo-payout-1', transactionDate: daysAgo(1), category: 'payout', transactionType: 'PAYOUT', amountCents: -7000, currency: 'USD', ebayOrderId: null, ebayLineItemId: null, feeType: null, description: 'Funds sent', source: 'demo', payoutId: 'demo-payout', referenceId: null, expenseCategory: null, memo: null }
];

export const demoData: DashboardData = {
  workspace: { id: 'workspace_demo', name: 'Demo Workspace', slug: 'demo-workspace', plan: 'demo', role: 'owner' },
  isDemo: true,
  connected: false,
  hasImportedData: false,
  financialsComplete: true,
  lastSyncedAt: null,
  inventory,
  sales,
  transactions,
  skuReservations: [],
  skuSequences: [],
  unallocatedNetCents: -1299
};
