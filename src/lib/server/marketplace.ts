export const MARKETPLACE_PROVIDERS = ['ebay', 'whatnot'] as const;

export type MarketplaceProvider = (typeof MARKETPLACE_PROVIDERS)[number];
export type TransactionProvider = MarketplaceProvider | 'manual' | 'other';

export type MarketplaceConnectionStatus =
  | 'connected'
  | 'not_connected'
  | 'pending'
  | 'error';

export function marketplaceLabel(provider: MarketplaceProvider) {
  return provider === 'ebay' ? 'eBay' : 'Whatnot';
}

export function marketplaceEntityId(
  workspaceId: string,
  provider: MarketplaceProvider,
  kind: 'account' | 'listing' | 'order' | 'order-item' | 'transaction',
  externalId: string
) {
  return `${workspaceId}:${provider}:${kind}:${externalId}`;
}

/**
 * Provider-neutral payload boundaries.
 *
 * Adapters (eBay API, Whatnot CSV/API, future marketplaces) normalize their
 * native payloads into these shapes before persistence/accounting logic sees
 * them. Keep marketplace-specific response objects OUT of business logic.
 */
export type NormalizedMarketplaceListing = {
  provider: MarketplaceProvider;
  externalListingId: string;
  externalItemId: string | null;
  sku: string | null;
  title: string;
  status: 'active' | 'scheduled' | 'ended' | 'sold';
  priceCents: number;
  currency: string;
  quantity: number;
  listedAt: string | null;
  endedAt: string | null;
  url: string | null;
};

export type NormalizedMarketplaceOrder = {
  provider: MarketplaceProvider;
  externalOrderId: string;
  status: string;
  createdAt: string;
  grossTotalCents: number;
  currency: string;
};

export type NormalizedMarketplaceOrderItem = {
  provider: MarketplaceProvider;
  externalLineItemId: string;
  externalItemId: string | null;
  externalOrderId: string;
  sku: string | null;
  title: string;
  quantity: number;
  salePriceCents: number;
  shippingChargedCents: number;
  soldAt: string;
};

export type NormalizedMarketplaceTransaction = {
  provider: TransactionProvider;
  externalTransactionId: string;
  externalOrderId: string | null;
  externalLineItemId: string | null;
  transactionType: string;
  category: string;
  amountCents: number;
  currency: string;
  transactionDate: string;
  description: string | null;
};
