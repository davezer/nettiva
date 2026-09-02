import type { DashboardData, InventoryRow, SaleRow } from '$lib/types';

const now = Date.now();
const daysAgo = (days: number) => new Date(now - days * 86_400_000).toISOString();

const inventory: InventoryRow[] = [
  { id: 'demo-1', title: '2024 Topps Chrome Aaron Judge /150', sku: 'CARD-A14', ebayItemId: 'demo-1001', imageUrl: null, costCents: 1200, source: 'Card show', location: 'A-14', status: 'active', listPriceCents: 3999, listedAt: daysAgo(43), ageDays: 43 },
  { id: 'demo-2', title: 'Nintendo Game Boy Color — Atomic Purple', sku: 'GAME-B07', ebayItemId: 'demo-1002', imageUrl: null, costCents: 3800, source: 'Marketplace', location: 'B-07', status: 'active', listPriceCents: 8999, listedAt: daysAgo(96), ageDays: 96 },
  { id: 'demo-3', title: 'Vintage Nike ACG Fleece Pullover XL', sku: 'CLOTH-C22', ebayItemId: 'demo-1003', imageUrl: null, costCents: null, source: 'Goodwill', location: 'C-22', status: 'active', listPriceCents: 6499, listedAt: daysAgo(18), ageDays: 18 },
  { id: 'demo-4', title: 'Sony Walkman WM-FX195 Cassette Player', sku: 'ELEC-D03', ebayItemId: 'demo-1004', imageUrl: null, costCents: 700, source: 'Yard sale', location: 'D-03', status: 'unlisted', listPriceCents: null, listedAt: null, ageDays: 0 },
  { id: 'demo-5', title: '2023 Bowman Chrome Gunnar Henderson Auto', sku: 'CARD-A09', ebayItemId: 'demo-1005', imageUrl: null, costCents: 2400, source: 'Card show', location: 'SOLD', status: 'sold', listPriceCents: 7499, listedAt: daysAgo(51), ageDays: 51 }
];

const sales: SaleRow[] = [
  { id: 'sale-1', title: '2023 Bowman Chrome Gunnar Henderson Auto', soldAt: daysAgo(2), salePriceCents: 7499, shippingChargedCents: 499, costsAndFeesCents: 1562, cogsCents: 2400, netProfitCents: 4036, margin: 50.5, roi: 168.2 },
  { id: 'sale-2', title: 'Sealed Pokémon Crown Zenith Elite Trainer Box', soldAt: daysAgo(5), salePriceCents: 6499, shippingChargedCents: 0, costsAndFeesCents: 1311, cogsCents: 2899, netProfitCents: 2289, margin: 35.2, roi: 79.0 },
  { id: 'sale-3', title: 'Carhartt Detroit Jacket J97 — Large', soldAt: daysAgo(9), salePriceCents: 13999, shippingChargedCents: 899, costsAndFeesCents: 3248, cogsCents: 3500, netProfitCents: 8150, margin: 54.7, roi: 232.9 },
  { id: 'sale-4', title: 'Microsoft Zune 30GB — Brown', soldAt: daysAgo(14), salePriceCents: 11999, shippingChargedCents: 599, costsAndFeesCents: 2577, cogsCents: 2200, netProfitCents: 7821, margin: 62.1, roi: 355.5 }
];

export const demoData: DashboardData = {
  isDemo: true,
  connected: false,
  hasImportedData: false,
  financialsComplete: true,
  lastSyncedAt: null,
  inventory,
  sales,
  unallocatedNetCents: 0,
};
