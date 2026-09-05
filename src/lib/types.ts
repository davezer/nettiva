export type WorkspaceSummary = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  role: 'owner' | 'admin' | 'member';
};

export type MarketplaceProvider = 'ebay' | 'whatnot';
export type TransactionProvider = MarketplaceProvider | 'manual' | 'other';

export type BuiltInInventoryCategory =
  | 'action_figures'
  | 'baseball_cards'
  | 'electronics'
  | 'movies'
  | 'video_games'
  | 'trading_cards'
  | 'clothing'
  | 'toys_games'
  | 'collectibles'
  | 'home_bar_kitchen'
  | 'books_print'
  | 'tools_hardware'
  | 'other';

export type CustomInventoryCategory = `custom_${string}`;
export type InventoryCategory = BuiltInInventoryCategory | CustomInventoryCategory;

export type InventoryCategoryDefinition = {
  value: InventoryCategory;
  label: string;
  prefix: string;
  custom?: boolean;
  /** False means hidden from NEW inventory assignment, not deleted from history. */
  enabled?: boolean;
};

export type InventoryRow = {
  id: string;
  title: string;
  sku: string | null;
  ebayItemId: string | null;
  imageUrl: string | null;
  conditionName: string | null;
  purchasedAt: string | null;
  category: InventoryCategory;
  costCents: number | null;
  source: string | null;
  location: string | null;
  status: 'active' | 'scheduled' | 'sold' | 'unlisted';
  listPriceCents: number | null;
  listedAt: string | null;
  ageDays: number;
};

export type SkuReservationRow = {
  id: string;
  sku: string;
  prefix: string;
  sequenceNumber: number;
  source: string;
  status: string;
  title: string | null;
  ebayItemId: string | null;
  inventoryItemId: string | null;
  reservedAt: string;
};

export type SkuSequenceRow = {
  prefix: string;
  lastNumber: number;
};

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
  | 'business_expense'
  | 'other';

export type ExpenseCategory =
  | 'shipping_supplies'
  | 'packaging'
  | 'inventory_supplies'
  | 'software'
  | 'marketplace_fees'
  | 'equipment'
  | 'advertising'
  | 'office_supplies'
  | 'travel'
  | 'other';

export type AccountingTransactionRow = {
  id: string;
  transactionDate: string;
  category: FinanceCategory;
  transactionType: string;
  amountCents: number;
  currency: string;
  ebayOrderId: string | null;
  ebayLineItemId: string | null;
  feeType: string | null;
  description: string | null;
  source: string;
  payoutId: string | null;
  referenceId: string | null;
  expenseCategory: ExpenseCategory | null;
  memo: string | null;
  /**
   * Provider-aware field added by Marketplace Foundation.
   * Optional for backwards-compatible demo/legacy fixtures.
   */
  marketplaceProvider?: TransactionProvider;
};

export type SaleRow = {
  id: string;
  inventoryItemId: string | null;
  ebayOrderId: string;
  ebayLineItemId: string;
  ebayItemId: string | null;
  title: string;
  soldAt: string;
  salePriceCents: number;
  shippingChargedCents: number;
  sellingFeesCents: number;
  shippingLabelCents: number;
  refundsCents: number;
  disputesCents: number;
  otherAdjustmentsCents: number;
  pnlAdjustmentsCents: number;
  costsAndFeesCents: number;
  cogsCents: number | null;
  netProfitCents: number;
  margin: number;
  roi: number | null;
  /**
   * eBay/Whatnot provider for this normalized sale.
   * Optional only so older demo fixtures remain valid.
   */
  marketplaceProvider?: MarketplaceProvider;
};

export type DashboardData = {
  currentUser: { name: string; email: string } | null;
  workspace: WorkspaceSummary;
  isDemo: boolean;
  connected: boolean;
  hasImportedData: boolean;
  financialsComplete: boolean;
  lastSyncedAt: string | null;
  unallocatedNetCents: number;
  inventory: InventoryRow[];
  sales: SaleRow[];
  transactions: AccountingTransactionRow[];
  skuReservations: SkuReservationRow[];
  skuSequences: SkuSequenceRow[];
  /** Effective workspace built-ins after enabled/prefix preferences are applied. */
  builtInInventoryCategories?: InventoryCategoryDefinition[];
  /** Workspace-created inventory categories. */
  customInventoryCategories?: InventoryCategoryDefinition[];
};
