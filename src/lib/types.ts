export type InventoryRow = {
  id: string;
  title: string;
  sku: string | null;
  ebayItemId: string | null;
  imageUrl: string | null;
  costCents: number | null;
  source: string | null;
  location: string | null;
  status: 'active' | 'sold' | 'unlisted';
  listPriceCents: number | null;
  listedAt: string | null;
  ageDays: number;
};

export type SaleRow = {
  id: string;
  title: string;
  soldAt: string;
  salePriceCents: number;
  shippingChargedCents: number;
  costsAndFeesCents: number;
  cogsCents: number;
  netProfitCents: number;
  margin: number;
  roi: number | null;
};

export type DashboardData = {
  isDemo: boolean;
  connected: boolean;
  hasImportedData: boolean;
  financialsComplete: boolean;
  lastSyncedAt: string | null;
  unallocatedNetCents: number;
  inventory: InventoryRow[];
  sales: SaleRow[];
};
