<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import {
    AlertTriangle, Archive, ArrowUpRight, BadgeDollarSign, BarChart3, Boxes,
    CalendarDays, Calculator, Check, ChevronRight, CircleDollarSign, ClipboardCheck, Clock3,
    Cloud, Download, ExternalLink, FileSpreadsheet, Info, LayoutDashboard, LoaderCircle,
    MapPin, PackageCheck, PlugZap, Printer, ReceiptText, RefreshCw, Search, Settings,
    ShoppingBag, ShieldCheck, Tag, TrendingUp, UserRound, WalletCards, X, LogOut
  } from '@lucide/svelte';
  import type {
    AccountingTransactionRow,
    DashboardData,
    ExpenseCategory,
    FinanceCategory,
    InventoryCategory,
    InventoryRow,
    MarketplaceProvider,
    SaleRow
  } from '$lib/types';
  import { money, shortDate } from '$lib/money';
  import { authClient } from '$lib/auth-client';
  import { BUILT_IN_INVENTORY_CATEGORIES } from '$lib/inventory-categories';

  let { data }: { data: DashboardData } = $props();

  type View = 'dashboard' | 'inventory' | 'sales' | 'accounting' | 'reports' | 'settings';
  type Filter = 'all' | InventoryRow['status'];
  type InventoryCategoryFilter = 'all' | InventoryCategory;
  type InventoryAgeBucket = 'all' | '0-30' | '31-60' | '61-90' | '90+';
  type InventorySort = 'default' | 'oldest' | 'highest-cost' | 'highest-ask' | 'unlisted-oldest';
  type DatePreset = 'all' | '30d' | 'this-month' | 'last-month' | 'ytd' | 'custom';
  type ChannelFilter = 'all' | MarketplaceProvider;

  const PNL_CATEGORIES = new Set<FinanceCategory>([
    'selling_fee', 'shipping_label', 'refund', 'dispute',
    'other_fee', 'adjustment', 'withheld_tax', 'purchase', 'business_expense'
  ]);

  let view = $state<View>('dashboard');
  let query = $state('');
  let filter = $state<Filter>('all');
  let inventoryCategoryFilter = $state<InventoryCategoryFilter>('all');
  let inventoryLocationFilter = $state('all');
  let inventoryAgeBucket = $state<InventoryAgeBucket>('all');
  let inventorySort = $state<InventorySort>('default');
  let selectedInventoryIds = $state<string[]>([]);
  let bulkOpen = $state(false);
  let bulkSaving = $state(false);
  let bulkMessage = $state<string | null>(null);
  let bulkApplyLocation = $state(false);
  let bulkLocation = $state('');
  let bulkApplySource = $state(false);
  let bulkSource = $state('');
  let bulkApplyCategory = $state(false);
  let bulkCategory = $state<InventoryCategory>('other');
  let bulkApplyCondition = $state(false);
  let bulkCondition = $state('');
  let bulkApplyDate = $state(false);
  let bulkDate = $state('');
  let bulkApplyCost = $state(false);
  let bulkCost = $state('');
  let syncing = $state(false);
  let editing = $state<InventoryRow | null>(null);
  let selectedSale = $state<SaleRow | null>(null);
  let intakeOpen = $state(false);
  let intakeTitle = $state('');
  let intakeSku = $state('');
  let intakeAutoSku = $state(true);
  let intakeCategory = $state<InventoryCategory>('action_figures');
  let intakePrefix = $state('AFG');
  let intakeQuantity = $state('1');
  let intakeCost = $state('');
  let intakeCostMode = $state<'each' | 'total'>('each');
  let intakeSource = $state('');
  let intakeLocation = $state('');
  let intakeCondition = $state('');
  let intakeDate = $state(new Date().toISOString().slice(0, 10));
  let intakeSaving = $state(false);
  let intakeMessage = $state<string | null>(null);
  let skuManagerOpen = $state(false);
  let skuPaste = $state('');
  let skuReserveMessage = $state<string | null>(null);
  let reservingSkus = $state(false);
  let deletingReservationId = $state<string | null>(null);
  let editTitle = $state('');
  let editSku = $state('');
  let editCondition = $state('');
  let editCategory = $state<InventoryCategory>('other');
  let editDate = $state('');
  let deletingInventory = $state(false);
  let cost = $state('');
  let source = $state('');
  let location = $state('');
  let saveMessage = $state<string | null>(null);
  let saving = $state(false);
  let savingCostId = $state<string | null>(null);
  let costMessage = $state<string | null>(null);
  let costDrafts = $state<Record<string, string>>({});
  let expenseDate = $state(new Date().toISOString().slice(0, 10));
  let expenseDescription = $state('');
  let expenseCategory = $state<ExpenseCategory>('shipping_supplies');
  let expenseAmount = $state('');
  let expenseMemo = $state('');
  let savingExpense = $state(false);
  let expenseMessage = $state<string | null>(null);
  let deletingExpenseId = $state<string | null>(null);
  let datePreset = $state<DatePreset>('all');
  let channelFilter = $state<ChannelFilter>('ebay');
  let customStart = $state('');
  let customEnd = $state('');
  let workspaceName = $state('');

  $effect(() => {
    workspaceName = data.workspace?.name ?? 'Primary Workspace';
  });
  let workspaceSaving = $state(false);
  let workspaceMessage = $state<string | null>(null);

  const workspaceSafe = $derived(data.workspace ?? {
    id: 'workspace_default',
    name: 'Primary Workspace',
    slug: 'primary-workspace',
    plan: 'founder',
    role: 'owner' as const
  });

  const expenseCategories: { value: ExpenseCategory; label: string }[] = [
    { value: 'shipping_supplies', label: 'Shipping supplies' },
    { value: 'packaging', label: 'Packaging' },
    { value: 'inventory_supplies', label: 'Inventory supplies' },
    { value: 'software', label: 'Software & subscriptions' },
    { value: 'marketplace_fees', label: 'Marketplace / show fees' },
    { value: 'equipment', label: 'Equipment' },
    { value: 'advertising', label: 'Advertising' },
    { value: 'office_supplies', label: 'Office supplies' },
    { value: 'travel', label: 'Travel' },
    { value: 'other', label: 'Other' }
  ];

  const inventoryCategories = $derived([
    ...(data.builtInInventoryCategories ?? BUILT_IN_INVENTORY_CATEGORIES),
    ...(data.customInventoryCategories ?? [])
  ]);

  const enabledInventoryCategories = $derived(
    inventoryCategories.filter((category) => category.enabled !== false)
  );

  const navItems = [
    { view: 'dashboard' as const, label: 'Overview', icon: LayoutDashboard },
    { view: 'inventory' as const, label: 'Inventory', icon: Boxes },
    { view: 'sales' as const, label: 'Sales', icon: BadgeDollarSign },
    { view: 'accounting' as const, label: 'Accounting', icon: Calculator },
    { view: 'reports' as const, label: 'Reports', icon: BarChart3 },
    { view: 'settings' as const, label: 'Data & Imports', icon: Settings }
  ];

  function inventoryCategoryLabel(category: InventoryCategory) {
    return inventoryCategories.find((option) => option.value === category)?.label ?? 'Unknown category';
  }

  function inventoryCategoryPrefix(category: InventoryCategory) {
    return inventoryCategories.find((option) => option.value === category)?.prefix ?? 'OTH';
  }

  function selectIntakeCategory(category: InventoryCategory) {
    intakeCategory = category;
    intakePrefix = inventoryCategoryPrefix(category);
  }

  function normalizedPrefix(value: string) {
    return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  }

  function clientSkuSequence(prefix: string) {
    const safePrefix = normalizedPrefix(prefix);
    if (!safePrefix) return 1;
    const pattern = new RegExp(`^${safePrefix}-(\\d+)$`, 'i');
    let max = skuSequencesSafe.find((row) => row.prefix.toUpperCase() === safePrefix)?.lastNumber ?? 0;
    for (const item of data.inventory) {
      const match = item.sku?.match(pattern);
      if (!match) continue;
      const value = Number(match[1]);
      if (Number.isInteger(value) && value > max) max = value;
    }
    for (const reservation of skuReservationsSafe) {
      if (reservation.prefix.toUpperCase() === safePrefix && reservation.sequenceNumber > max) max = reservation.sequenceNumber;
    }
    return max + 1;
  }

  function formatInventorySku(prefix: string, sequence: number) {
    return `${normalizedPrefix(prefix)}-${String(sequence).padStart(4, '0')}`;
  }

  function dateRange() {
    if (datePreset === 'all') return { start: null as Date | null, end: null as Date | null };

    const now = new Date();
    let start: Date | null = null;
    let end: Date | null = new Date(now);

    if (datePreset === '30d') {
      start = new Date(now);
      start.setDate(start.getDate() - 30);
    } else if (datePreset === 'this-month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (datePreset === 'last-month') {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    } else if (datePreset === 'ytd') {
      start = new Date(now.getFullYear(), 0, 1);
    } else {
      start = customStart ? new Date(`${customStart}T00:00:00`) : null;
      end = customEnd ? new Date(`${customEnd}T23:59:59.999`) : null;
    }

    return { start, end };
  }

  function inDateRange(value: string) {
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) return false;
    const { start, end } = dateRange();
    return (!start || timestamp >= start.getTime()) && (!end || timestamp <= end.getTime());
  }

  function saleProvider(sale: SaleRow): MarketplaceProvider {
    // Demo/legacy rows predate provider tagging and are eBay-shaped.
    return sale.marketplaceProvider === 'whatnot' ? 'whatnot' : 'ebay';
  }

  function transactionProvider(transaction: AccountingTransactionRow) {
    if (transaction.marketplaceProvider) return transaction.marketplaceProvider;
    return transaction.source === 'manual' ? 'manual' : 'ebay';
  }

  function marketplaceLabel(provider: MarketplaceProvider) {
    return provider === 'whatnot' ? 'Whatnot' : 'eBay';
  }

  function transactionChannelLabel(transaction: AccountingTransactionRow) {
    const provider = transactionProvider(transaction);
    if (provider === 'manual') return 'Business-wide';
    if (provider === 'whatnot') return 'Whatnot';
    if (provider === 'ebay') return 'eBay';
    return 'Other';
  }

  const channelLabel = $derived(
    channelFilter === 'all' ? 'All channels' : marketplaceLabel(channelFilter)
  );

  const filteredSales = $derived.by(() =>
    data.sales.filter((sale) =>
      inDateRange(sale.soldAt) &&
      (channelFilter === 'all' || saleProvider(sale) === channelFilter)
    )
  );

  const filteredTransactions = $derived.by(() =>
    data.transactions.filter((transaction) =>
      inDateRange(transaction.transactionDate) &&
      (
        channelFilter === 'all' ||
        transactionProvider(transaction) === channelFilter
      )
    )
  );

  const metrics = $derived.by(() => {
    const gross = filteredSales.reduce(
      (sum, sale) => sum + sale.salePriceCents + sale.shippingChargedCents,
      0
    );
    const cogs = filteredSales.reduce((sum, sale) => sum + (sale.cogsCents ?? 0), 0);
    const missingCogs = filteredSales.filter((sale) => sale.cogsCents == null).length;
    const pnlAdjustments = filteredTransactions.reduce(
      (sum, transaction) => sum + (PNL_CATEGORIES.has(transaction.category) ? transaction.amountCents : 0),
      0
    );
    const profit = gross + pnlAdjustments - cogs;
    const sellingFees = filteredTransactions.reduce(
      (sum, transaction) => sum + (
        transaction.category === 'selling_fee' && transaction.amountCents < 0
          ? -transaction.amountCents : 0
      ),
      0
    );
    const shippingLabels = filteredTransactions.reduce(
      (sum, transaction) => sum + (
        transaction.category === 'shipping_label' && transaction.amountCents < 0
          ? -transaction.amountCents : 0
      ),
      0
    );
    const refundsDisputes = filteredTransactions.reduce(
      (sum, transaction) => sum + (
        (transaction.category === 'refund' || transaction.category === 'dispute') && transaction.amountCents < 0
          ? -transaction.amountCents : 0
      ),
      0
    );
    const otherAdjustments = filteredTransactions.reduce(
      (sum, transaction) => sum + (
        ['other_fee', 'adjustment', 'withheld_tax', 'purchase'].includes(transaction.category)
          ? transaction.amountCents : 0
      ),
      0
    );
    const businessExpenses = filteredTransactions.reduce(
      (sum, transaction) => sum + (
        transaction.category === 'business_expense' && transaction.amountCents < 0
          ? -transaction.amountCents : 0
      ),
      0
    );

    return {
      gross,
      cogs,
      missingCogs,
      pnlAdjustments,
      profit,
      sellingFees,
      shippingLabels,
      refundsDisputes,
      otherAdjustments,
      businessExpenses,
      margin: gross ? (profit / gross) * 100 : 0
    };
  });

  const dashboardSales = $derived.by(() =>
    data.sales.filter((sale) => inDateRange(sale.soldAt) && saleProvider(sale) === 'ebay')
  );

  const dashboardTransactions = $derived.by(() =>
    data.transactions.filter((transaction) =>
      inDateRange(transaction.transactionDate) && transactionProvider(transaction) === 'ebay'
    )
  );

  const dashboardMetrics = $derived.by(() => {
    const gross = dashboardSales.reduce(
      (sum, sale) => sum + sale.salePriceCents + sale.shippingChargedCents,
      0
    );
    const cogs = dashboardSales.reduce((sum, sale) => sum + (sale.cogsCents ?? 0), 0);
    const missingCogs = dashboardSales.filter((sale) => sale.cogsCents == null).length;
    const pnlAdjustments = dashboardTransactions.reduce(
      (sum, transaction) => sum + (
        PNL_CATEGORIES.has(transaction.category) ? transaction.amountCents : 0
      ),
      0
    );
    const profit = gross + pnlAdjustments - cogs;
    return {
      gross,
      cogs,
      missingCogs,
      pnlAdjustments,
      profit,
      margin: gross ? (profit / gross) * 100 : 0
    };
  });

  const dashboardProfitIsFinal = $derived(
    data.financialsComplete && dashboardMetrics.missingCogs === 0
  );

  const latestEbayDataAt = $derived.by(() => {
    let latest: string | null = null;
    let latestTimestamp = -Infinity;
    for (const transaction of data.transactions) {
      if (transactionProvider(transaction) !== 'ebay' || transaction.source !== 'ebay_csv') continue;
      const timestamp = Date.parse(transaction.transactionDate);
      if (Number.isFinite(timestamp) && timestamp > latestTimestamp) {
        latestTimestamp = timestamp;
        latest = transaction.transactionDate;
      }
    }
    return latest;
  });

  const headerMissingCogs = $derived(
    view === 'dashboard' ? dashboardMetrics.missingCogs : metrics.missingCogs
  );

  const activeItems = $derived(data.inventory.filter((item) => item.status === 'active'));
  const scheduledItems = $derived(data.inventory.filter((item) => item.status === 'scheduled'));
  const avgAge = $derived(activeItems.length
    ? Math.round(activeItems.reduce((sum, item) => sum + item.ageDays, 0) / activeItems.length)
    : 0
  );
  const stale = $derived(activeItems.filter((item) => item.ageDays >= 90).length);
  const unlistedCount = $derived(data.inventory.filter((item) => item.status === 'unlisted').length);
  const inventoryCostBasis = $derived(data.inventory
    .filter((item) => item.status !== 'sold')
    .reduce((sum, item) => sum + (item.costCents ?? 0), 0)
  );
  const activeValue = $derived(activeItems.reduce((sum, item) => sum + (item.listPriceCents ?? 0), 0));
  const unsoldItems = $derived(data.inventory.filter((item) => item.status !== 'sold'));
  const unlistedItems = $derived(data.inventory.filter((item) => item.status === 'unlisted'));
  const unlistedInvestment = $derived(
    unlistedItems.reduce((sum, item) => sum + (item.costCents ?? 0), 0)
  );
  function daysSince(value?: string | null) {
    if (!value) return null;
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) return null;
    return Math.max(0, Math.floor((Date.now() - timestamp) / 86_400_000));
  }

  function matchesActiveAgeBucket(item: InventoryRow) {
    if (inventoryAgeBucket === 'all') return true;
    if (item.status !== 'active' && item.status !== 'scheduled') return false;

    if (inventoryAgeBucket === '0-30') return item.ageDays <= 30;
    if (inventoryAgeBucket === '31-60') return item.ageDays >= 31 && item.ageDays <= 60;
    if (inventoryAgeBucket === '61-90') return item.ageDays >= 61 && item.ageDays <= 90;
    return item.ageDays >= 91;
  }

  function setInventoryAgeBucket(bucket: InventoryAgeBucket) {
    inventoryAgeBucket = bucket;
    if (bucket !== 'all') filter = 'active';
  }

  const activeAgeBuckets = $derived.by(() => {
    const bucket = (min: number, max: number | null) => {
      const items = activeItems.filter((item) =>
        item.ageDays >= min && (max == null || item.ageDays <= max)
      );
      return {
        count: items.length,
        cogs: items.reduce((sum, item) => sum + (item.costCents ?? 0), 0),
        asking: items.reduce((sum, item) => sum + (item.listPriceCents ?? 0), 0)
      };
    };

    return {
      fresh: bucket(0, 30),
      warming: bucket(31, 60),
      aging: bucket(61, 90),
      stale: bucket(91, null)
    };
  });

  const unlistedOver30 = $derived.by(() =>
    unlistedItems.filter((item) => {
      const age = daysSince(item.purchasedAt);
      return age != null && age >= 30;
    })
  );

  const unlistedOver30Cogs = $derived(
    unlistedOver30.reduce((sum, item) => sum + (item.costCents ?? 0), 0)
  );

  const activeOver60 = $derived(activeItems.filter((item) => item.ageDays >= 61));
  const activeOver60Cogs = $derived(
    activeOver60.reduce((sum, item) => sum + (item.costCents ?? 0), 0)
  );

  const staleCogs = $derived(
    activeItems
      .filter((item) => item.ageDays >= 91)
      .reduce((sum, item) => sum + (item.costCents ?? 0), 0)
  );

  const inventoryHealthByCategory = $derived.by(() =>
    inventoryCategories
      .map((category) => {
        const tracked = data.inventory.filter((item) => item.category === category.value);
        const soldItems = tracked.filter((item) => item.status === 'sold');
        const unsold = tracked.filter((item) => item.status !== 'sold');
        const active = tracked.filter((item) => item.status === 'active');
        const unlisted = tracked.filter((item) => item.status === 'unlisted');
        const staleItems = active.filter((item) => item.ageDays >= 91);
        const unsoldCogs = unsold.reduce((sum, item) => sum + (item.costCents ?? 0), 0);
        const activeAsking = active.reduce((sum, item) => sum + (item.listPriceCents ?? 0), 0);
        const averageActiveAge = active.length
          ? Math.round(active.reduce((sum, item) => sum + item.ageDays, 0) / active.length)
          : null;

        return {
          ...category,
          tracked: tracked.length,
          sold: soldItems.length,
          unsold: unsold.length,
          active: active.length,
          unlisted: unlisted.length,
          stale: staleItems.length,
          unsoldCogs,
          activeAsking,
          averageActiveAge,
          sellThrough: tracked.length ? (soldItems.length / tracked.length) * 100 : 0
        };
      })
      .filter((row) => row.tracked > 0)
      .sort((a, b) => b.unsoldCogs - a.unsoldCogs || b.tracked - a.tracked)
  );

  const inventoryHealthSummary = $derived.by(() => {
    const tracked = data.inventory.length;
    const sold = data.inventory.filter((item) => item.status === 'sold').length;
    return {
      tracked,
      sold,
      sellThrough: tracked ? (sold / tracked) * 100 : 0,
      activeOver60: activeOver60.length,
      unlistedOver30: unlistedOver30.length
    };
  });

  const missingSaleCosts = $derived(filteredSales.filter((sale) => sale.cogsCents == null));
  const manualExpenses = $derived(
    filteredTransactions.filter((transaction) =>
      transaction.category === 'business_expense' && transaction.source === 'manual'
    )
  );
  const maxProfit = $derived(Math.max(...filteredSales.map((sale) => sale.netProfitCents), 1));

  const intakeSkuPreview = $derived.by(() => {
    if (!intakeAutoSku) return intakeSku.trim() || 'Enter custom SKU';

    const prefix = normalizedPrefix(intakePrefix);
    if (!prefix) return 'Enter prefix';

    const first = clientSkuSequence(prefix);
    const quantity = Math.max(1, Math.min(50, Number(intakeQuantity) || 1));
    if (quantity === 1) return formatInventorySku(prefix, first);
    return `${formatInventorySku(prefix, first)} → ${formatInventorySku(prefix, first + quantity - 1)}`;
  });

  const intakeCostSummary = $derived.by(() => {
    const quantity = Math.max(1, Math.min(50, Number(intakeQuantity) || 1));
    const cents = Math.max(0, Math.round((Number(intakeCost) || 0) * 100));

    if (quantity === 1 || intakeCostMode === 'each') {
      return quantity === 1
        ? `${money(cents)} COGS`
        : `${money(cents)} each · ${money(cents * quantity)} total`;
    }

    const base = Math.floor(cents / quantity);
    const remainder = cents % quantity;
    if (!remainder) return `${money(base)} each · exact ${money(cents)} lot total`;

    return `${remainder} item${remainder === 1 ? '' : 's'} at ${money(base + 1)}, ${quantity - remainder} at ${money(base)} · exact ${money(cents)} total`;
  });

  const skuSequencesSafe = $derived(data.skuSequences ?? []);
  const skuReservationsSafe = $derived(data.skuReservations ?? []);

  const skuPrefixSummary = $derived.by(() =>
    enabledInventoryCategories.map((category) => ({
      ...category,
      nextSku: formatInventorySku(category.prefix, clientSkuSequence(category.prefix)),
      lastNumber: clientSkuSequence(category.prefix) - 1
    }))
  );

  const manualReservations = $derived(
    skuReservationsSafe.filter((reservation) => reservation.source === 'manual_bootstrap')
  );

  const inventoryLocations = $derived(
    [...new Set(data.inventory.map((item) => item.location?.trim()).filter((value): value is string => Boolean(value)))]
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
  );

  const filteredInventory = $derived.by(() => {
    const rows = data.inventory.filter((item) => {
      const matchesStatus = filter === 'all' || item.status === filter;
      const matchesCategory = inventoryCategoryFilter === 'all' || item.category === inventoryCategoryFilter;
      const matchesLocation =
        inventoryLocationFilter === 'all' ||
        (inventoryLocationFilter === '__unset__' ? !item.location : item.location === inventoryLocationFilter);
      const matchesAge = matchesActiveAgeBucket(item);
      const haystack = `${item.title} ${item.sku ?? ''} ${item.ebayItemId ?? ''} ${inventoryCategoryLabel(item.category)} ${item.location ?? ''} ${item.source ?? ''} ${item.conditionName ?? ''}`.toLowerCase();
      return matchesStatus && matchesCategory && matchesLocation && matchesAge && haystack.includes(query.toLowerCase());
    });

    if (inventorySort === 'oldest') {
      return [...rows].sort((a, b) => b.ageDays - a.ageDays);
    }

    if (inventorySort === 'highest-cost') {
      return [...rows].sort((a, b) => (b.costCents ?? 0) - (a.costCents ?? 0));
    }

    if (inventorySort === 'highest-ask') {
      return [...rows].sort((a, b) => (b.listPriceCents ?? 0) - (a.listPriceCents ?? 0));
    }

    if (inventorySort === 'unlisted-oldest') {
      return [...rows].sort((a, b) => {
        const aAge = a.status === 'unlisted' ? (daysSince(a.purchasedAt) ?? -1) : -1;
        const bAge = b.status === 'unlisted' ? (daysSince(b.purchasedAt) ?? -1) : -1;
        return bAge - aAge;
      });
    }

    return rows;
  });

  const selectedInventoryItems = $derived(
    data.inventory.filter((item) => selectedInventoryIds.includes(item.id))
  );

  const filteredSelectedCount = $derived(
    filteredInventory.filter((item) => selectedInventoryIds.includes(item.id)).length
  );

  const allFilteredSelected = $derived(
    filteredInventory.length > 0 && filteredSelectedCount === filteredInventory.length
  );

  const relatedTransactions = $derived.by(() => {
    if (!selectedSale) return [];
    const provider = saleProvider(selectedSale);

    return data.transactions.filter((transaction) =>
      transactionProvider(transaction) === provider &&
      (
        transaction.ebayLineItemId === selectedSale?.ebayLineItemId ||
        transaction.ebayOrderId === selectedSale?.ebayOrderId
      )
    );
  });

  const inventoryById = $derived.by(() =>
    new Map(data.inventory.map((item) => [item.id, item] as const))
  );

  const purchaseLotsSafe = $derived(data.purchaseLots ?? []);

  const filteredPurchaseLots = $derived(
    purchaseLotsSafe.filter((lot) => inDateRange(lot.purchasedAt ?? lot.createdAt))
  );

  const businessPeriodSales = $derived(
    data.sales.filter((sale) => inDateRange(sale.soldAt))
  );

  const purchaseLotAccounting = $derived.by(() =>
    purchaseLotsSafe
      .map((lot) => {
        const items = data.inventory.filter((item) => item.purchaseLotId === lot.id);
        const itemIds = new Set(items.map((item) => item.id));
        const sales = data.sales.filter((sale) =>
          Boolean(sale.inventoryItemId && itemIds.has(sale.inventoryItemId))
        );
        const sold = items.filter((item) => item.status === 'sold').length;
        const gross = sales.reduce(
          (sum, sale) => sum + sale.salePriceCents + sale.shippingChargedCents,
          0
        );
        const realizedProfit = sales.reduce((sum, sale) => sum + sale.netProfitCents, 0);
        const soldCogs = sales.reduce((sum, sale) => sum + (sale.cogsCents ?? 0), 0);
        const missingCogs = sales.filter((sale) => sale.cogsCents == null).length;
        const unsoldCogs = items
          .filter((item) => item.status !== 'sold')
          .reduce((sum, item) => sum + (item.costCents ?? 0), 0);

        return {
          ...lot,
          trackedItems: items.length,
          sold,
          gross,
          realizedProfit,
          soldCogs,
          missingCogs,
          unsoldCogs,
          recovery: lot.totalCostCents > 0 ? (gross / lot.totalCostCents) * 100 : null
        };
      })
      .sort((a, b) =>
        Date.parse(b.purchasedAt ?? b.createdAt) - Date.parse(a.purchasedAt ?? a.createdAt)
      )
  );

  const purchaseAccountingSummary = $derived.by(() => {
    const purchaseCash = filteredPurchaseLots.reduce(
      (sum, lot) => sum + lot.totalCostCents,
      0
    );
    const recognizedCogs = businessPeriodSales.reduce(
      (sum, sale) => sum + (sale.cogsCents ?? 0),
      0
    );
    const missingCogs = businessPeriodSales.filter((sale) => sale.cogsCents == null).length;
    const standaloneUnsoldBasis = unsoldItems
      .filter((item) => !item.purchaseLotId)
      .reduce((sum, item) => sum + (item.costCents ?? 0), 0);
    const recordedLotCost = purchaseLotAccounting.reduce(
      (sum, lot) => sum + lot.totalCostCents,
      0
    );
    const recordedLotGross = purchaseLotAccounting.reduce(
      (sum, lot) => sum + lot.gross,
      0
    );

    return {
      purchaseCash,
      purchaseLotsInPeriod: filteredPurchaseLots.length,
      recognizedCogs,
      missingCogs,
      unsoldBasis: inventoryCostBasis,
      standaloneUnsoldBasis,
      recordedLotCost,
      recordedLotGross,
      lotRecovery: recordedLotCost > 0
        ? (recordedLotGross / recordedLotCost) * 100
        : null
    };
  });

  const saleAnalytics = $derived.by(() =>
    filteredSales.map((sale) => {
      const inventory = sale.inventoryItemId
        ? inventoryById.get(sale.inventoryItemId) ?? null
        : null;
      const gross = sale.salePriceCents + sale.shippingChargedCents;

      return {
        sale,
        inventory,
        gross,
        profit: sale.netProfitCents,
        margin: gross ? (sale.netProfitCents / gross) * 100 : 0,
        category: inventory ? inventoryCategoryLabel(inventory.category) : 'Uncategorized',
        source: inventory?.source?.trim() || 'Source not set'
      };
    })
  );

  const costedSaleAnalytics = $derived(
    saleAnalytics.filter((row) => row.sale.cogsCents != null)
  );

  const analyticsSummary = $derived.by(() => {
    const costedProfit = costedSaleAnalytics.reduce((sum, row) => sum + row.profit, 0);
    const costedCogs = costedSaleAnalytics.reduce(
      (sum, row) => sum + (row.sale.cogsCents ?? 0),
      0
    );

    return {
      averageSaleProfit: costedSaleAnalytics.length
        ? costedProfit / costedSaleAnalytics.length
        : 0,
      overallRoi: costedCogs > 0
        ? (costedProfit / costedCogs) * 100
        : null,
      costedSales: costedSaleAnalytics.length,
      missingCogs: saleAnalytics.length - costedSaleAnalytics.length
    };
  });

  type AnalyticsGroupRow = {
    key: string;
    sales: number;
    gross: number;
    profit: number;
    cogs: number;
    missingCogs: number;
    margin: number;
    roi: number | null;
    averageProfit: number;
  };

  function analyticsGroups(field: 'category' | 'source'): AnalyticsGroupRow[] {
    const groups = new Map<string, AnalyticsGroupRow>();

    for (const row of saleAnalytics) {
      const key = row[field];
      let group = groups.get(key);

      if (!group) {
        group = {
          key,
          sales: 0,
          gross: 0,
          profit: 0,
          cogs: 0,
          missingCogs: 0,
          margin: 0,
          roi: null,
          averageProfit: 0
        };
        groups.set(key, group);
      }

      group.sales += 1;
      group.gross += row.gross;
      group.profit += row.profit;

      if (row.sale.cogsCents == null) {
        group.missingCogs += 1;
      } else {
        group.cogs += row.sale.cogsCents;
      }
    }

    for (const group of groups.values()) {
      group.margin = group.gross ? (group.profit / group.gross) * 100 : 0;
      group.averageProfit = group.sales ? group.profit / group.sales : 0;
      group.roi = group.missingCogs === 0 && group.cogs > 0
        ? (group.profit / group.cogs) * 100
        : null;
    }

    return [...groups.values()].sort((a, b) => b.profit - a.profit);
  }

  const categoryAnalytics = $derived.by(() => analyticsGroups('category'));
  const sourceAnalytics = $derived.by(() => analyticsGroups('source'));

  const highestProfitSale = $derived.by(() =>
    costedSaleAnalytics.length
      ? [...costedSaleAnalytics].sort((a, b) => b.profit - a.profit)[0]
      : null
  );

  const highestRoiSale = $derived.by(() => {
    const rows = costedSaleAnalytics.filter((row) => row.sale.roi != null);
    return rows.length
      ? [...rows].sort((a, b) => (b.sale.roi ?? -Infinity) - (a.sale.roi ?? -Infinity))[0]
      : null;
  });

  const lowestProfitSale = $derived.by(() =>
    costedSaleAnalytics.length
      ? [...costedSaleAnalytics].sort((a, b) => a.profit - b.profit)[0]
      : null
  );

  const lowestMarginSale = $derived.by(() =>
    costedSaleAnalytics.length
      ? [...costedSaleAnalytics].sort((a, b) => a.margin - b.margin)[0]
      : null
  );

  const monthlyRows = $derived.by(() => {
    const months = new Map<string, {
      key: string;
      label: string;
      gross: number;
      sellingFees: number;
      shippingLabels: number;
      refundsDisputes: number;
      otherAdjustments: number;
      businessExpenses: number;
      cogs: number;
      missingCogs: number;
      profit: number;
      margin: number;
      sales: number;
    }>();

    const ensure = (value: string) => {
      const date = new Date(value);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      let row = months.get(key);
      if (!row) {
        row = {
          key,
          label: new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(date),
          gross: 0,
          sellingFees: 0,
          shippingLabels: 0,
          refundsDisputes: 0,
          otherAdjustments: 0,
          businessExpenses: 0,
          cogs: 0,
          missingCogs: 0,
          profit: 0,
          margin: 0,
          sales: 0
        };
        months.set(key, row);
      }
      return row;
    };

    for (const sale of filteredSales) {
      const row = ensure(sale.soldAt);
      row.gross += sale.salePriceCents + sale.shippingChargedCents;
      row.cogs += sale.cogsCents ?? 0;
      row.missingCogs += sale.cogsCents == null ? 1 : 0;
      row.sales += 1;
    }

    for (const transaction of filteredTransactions) {
      const row = ensure(transaction.transactionDate);
      const amount = transaction.amountCents;

      if (transaction.category === 'selling_fee' && amount < 0) row.sellingFees += -amount;
      else if (transaction.category === 'shipping_label' && amount < 0) row.shippingLabels += -amount;
      else if ((transaction.category === 'refund' || transaction.category === 'dispute') && amount < 0) row.refundsDisputes += -amount;
      else if (transaction.category === 'business_expense' && amount < 0) row.businessExpenses += -amount;
      else if (['other_fee', 'adjustment', 'withheld_tax', 'purchase'].includes(transaction.category)) row.otherAdjustments += amount;
    }

    for (const row of months.values()) {
      row.profit =
        row.gross
        - row.sellingFees
        - row.shippingLabels
        - row.refundsDisputes
        + row.otherAdjustments
        - row.businessExpenses
        - row.cogs;
      row.margin = row.gross ? (row.profit / row.gross) * 100 : 0;
    }

    return [...months.values()].sort((a, b) => b.key.localeCompare(a.key));
  });

  const expenseBreakdown = $derived.by(() => {
    const totals = new Map<ExpenseCategory, number>();
    for (const transaction of manualExpenses) {
      const category = transaction.expenseCategory ?? 'other';
      totals.set(category, (totals.get(category) ?? 0) + Math.abs(transaction.amountCents));
    }
    return [...totals.entries()]
      .map(([category, amountCents]) => ({
        category,
        label: expenseCategoryLabel(category),
        amountCents
      }))
      .sort((a, b) => b.amountCents - a.amountCents);
  });

  const maxExpenseCategory = $derived(Math.max(...expenseBreakdown.map((row) => row.amountCents), 1));

  const profitIsFinal = $derived(data.financialsComplete && metrics.missingCogs === 0);
  const profitLabel = $derived(
    !data.financialsComplete
      ? 'Estimated profit'
      : metrics.missingCogs
        ? channelFilter === 'all'
          ? 'Profit before missing COGS'
          : `${marketplaceLabel(channelFilter)} profit before missing COGS`
        : channelFilter === 'all'
          ? 'Net profit'
          : `${marketplaceLabel(channelFilter)} channel profit`
  );

  const percent = (value: number) => `${value.toFixed(1)}%`;
  const initials = (title: string) =>
    title.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join('').toUpperCase();

  function inventorySelected(id: string) {
    return selectedInventoryIds.includes(id);
  }

  function toggleInventorySelection(id: string) {
    selectedInventoryIds = inventorySelected(id)
      ? selectedInventoryIds.filter((value) => value !== id)
      : [...selectedInventoryIds, id];
  }

  function toggleFilteredInventorySelection() {
    const filteredIds = new Set(filteredInventory.map((item) => item.id));

    if (allFilteredSelected) {
      selectedInventoryIds = selectedInventoryIds.filter((id) => !filteredIds.has(id));
      return;
    }

    selectedInventoryIds = [...new Set([
      ...selectedInventoryIds,
      ...filteredInventory.map((item) => item.id)
    ])];
  }

  function clearInventorySelection() {
    selectedInventoryIds = [];
  }

  function openBulkInventoryEditor() {
    if (!selectedInventoryIds.length) return;

    bulkApplyLocation = false;
    bulkLocation = '';
    bulkApplySource = false;
    bulkSource = '';
    bulkApplyCategory = false;
    bulkCategory = selectedInventoryItems[0]?.category ?? 'other';
    bulkApplyCondition = false;
    bulkCondition = '';
    bulkApplyDate = false;
    bulkDate = '';
    bulkApplyCost = false;
    bulkCost = '';
    bulkMessage = null;
    bulkOpen = true;
  }

  async function saveBulkInventory(event: SubmitEvent) {
    event.preventDefault();
    if (!selectedInventoryIds.length) return;

    if (data.isDemo) {
      bulkMessage = 'Demo inventory is not saved.';
      return;
    }

    const body: Record<string, unknown> = {
      ids: selectedInventoryIds
    };

    if (bulkApplyLocation) body.storageLocation = bulkLocation.trim() || null;
    if (bulkApplySource) body.source = bulkSource.trim() || null;
    if (bulkApplyCategory) body.category = bulkCategory;
    if (bulkApplyCondition) body.conditionName = bulkCondition.trim() || null;
    if (bulkApplyDate) body.purchasedAt = bulkDate || null;

    if (bulkApplyCost) {
      if (bulkCost.trim() === '') {
        body.purchaseCostCents = null;
      } else {
        const parsed = Number(bulkCost);
        if (!Number.isFinite(parsed) || parsed < 0) {
          bulkMessage = 'Enter a valid purchase cost, or leave it blank to clear COGS.';
          return;
        }
        body.purchaseCostCents = Math.round(parsed * 100);
      }
    }

    if (Object.keys(body).length === 1) {
      bulkMessage = 'Choose at least one field to apply.';
      return;
    }

    bulkSaving = true;
    bulkMessage = null;

    const response = await fetch('/api/inventory/batch', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });

    bulkSaving = false;

    const result = await response.json().catch(() => null) as {
      error?: string;
      updated?: number;
    } | null;

    if (!response.ok) {
      bulkMessage = result?.error ?? 'Could not update the selected inventory.';
      return;
    }

    const updated = result?.updated ?? selectedInventoryIds.length;
    if (bulkApplyLocation && inventoryLocationFilter !== 'all') {
      inventoryLocationFilter = 'all';
    }
    bulkOpen = false;
    selectedInventoryIds = [];
    await invalidateAll();
    bulkMessage = `${updated} item${updated === 1 ? '' : 's'} updated.`;
  }

  function openEditor(item: InventoryRow) {
    editing = item;
    editTitle = item.title;
    editSku = item.sku ?? '';
    editCondition = item.conditionName ?? '';
    editCategory = item.category;
    editDate = item.purchasedAt ? item.purchasedAt.slice(0, 10) : '';
    cost = item.costCents == null ? '' : (item.costCents / 100).toFixed(2);
    source = item.source ?? '';
    location = item.location ?? '';
    saveMessage = null;
  }

  function openIntake() {
    intakeTitle = '';
    intakeSku = '';
    intakeAutoSku = true;
    const filteredCategory =
      inventoryCategoryFilter === 'all'
        ? null
        : enabledInventoryCategories.find((category) => category.value === inventoryCategoryFilter)?.value ?? null;
    const startingCategory =
      filteredCategory ??
      enabledInventoryCategories.find((category) => category.value === 'action_figures')?.value ??
      enabledInventoryCategories[0]?.value ??
      'other';
    intakeCategory = startingCategory;
    intakePrefix = inventoryCategoryPrefix(startingCategory);
    intakeQuantity = '1';
    intakeCost = '';
    intakeCostMode = 'each';
    intakeSource = '';
    intakeLocation = '';
    intakeCondition = '';
    intakeDate = new Date().toISOString().slice(0, 10);
    intakeMessage = null;
    intakeOpen = true;
  }

  function openCogsQueue() {
    window.location.assign('/cogs');
  }

  function formatSigned(cents: number) {
    if (cents === 0) return money(0);
    return `${cents > 0 ? '+' : '−'}${money(Math.abs(cents))}`;
  }

  function categoryLabel(category: FinanceCategory) {
    return category.replace(/_/g, ' ');
  }

  function expenseCategoryLabel(category: ExpenseCategory | null) {
    return expenseCategories.find((option) => option.value === category)?.label ?? 'Other';
  }

  function transactionDisplayLabel(transaction: AccountingTransactionRow) {
    if (transaction.category === 'sale') return 'Order net proceeds';
    if (transaction.category === 'shipping_label') return transaction.description || 'Shipping label';
    return transaction.feeType || transaction.description || transaction.transactionType;
  }

  function excludedFromPnl(category: FinanceCategory) {
    return !PNL_CATEGORIES.has(category) && category !== 'sale';
  }

  async function saveItem(event: SubmitEvent) {
    event.preventDefault();
    if (!editing) return;
    if (data.isDemo) {
      saveMessage = 'Demo edits are not saved.';
      return;
    }

    saving = true;
    saveMessage = null;
    const response = await fetch(`/api/inventory/${encodeURIComponent(editing.id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: editTitle.trim(),
        sku: editSku.trim() || null,
        conditionName: editCondition.trim() || null,
        category: editCategory,
        purchasedAt: editDate || null,
        purchaseCostCents: cost.trim() === '' ? null : Math.round(Number(cost) * 100),
        source: source.trim() || null,
        storageLocation: location.trim() || null
      })
    });
    saving = false;

    if (!response.ok) {
      const result = await response.json().catch(() => null) as { error?: string } | null;
      saveMessage = result?.error ?? 'Could not save this item.';
      return;
    }

    editing = null;
    await invalidateAll();
  }

  async function reserveSkus(event: SubmitEvent) {
    event.preventDefault();
    if (data.isDemo) { skuReserveMessage = 'Demo SKU reservations are not saved.'; return; }
    if (!skuPaste.trim()) { skuReserveMessage = 'Paste one or more existing eBay SKUs first.'; return; }
    reservingSkus = true; skuReserveMessage = null;
    const response = await fetch('/api/sku-reservations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: skuPaste }) });
    reservingSkus = false;
    const result = await response.json().catch(() => null) as { error?: string; found?: number; reserved?: number; alreadyKnown?: number } | null;
    if (!response.ok) { skuReserveMessage = result?.error ?? 'Could not reserve these SKUs.'; return; }
    skuReserveMessage = `${result?.reserved ?? 0} reserved · ${result?.alreadyKnown ?? 0} already known · ${result?.found ?? 0} detected`;
    skuPaste = '';
    await invalidateAll();
  }

  async function deleteSkuReservation(id: string, sku: string) {
    if (data.isDemo) { skuReserveMessage = 'Demo SKU reservations are not saved.'; return; }
    if (!confirm(`Remove reservation for ${sku}? The number will stay burned and will not be reused.`)) return;
    deletingReservationId = id; skuReserveMessage = null;
    const response = await fetch(`/api/sku-reservations/${encodeURIComponent(id)}`, { method: 'DELETE' });
    deletingReservationId = null;
    if (!response.ok) { const result = await response.json().catch(() => null) as { error?: string } | null; skuReserveMessage = result?.error ?? 'Could not remove this reservation.'; return; }
    skuReserveMessage = `${sku} reservation removed. Its sequence number remains permanently used.`;
    await invalidateAll();
  }

  async function saveIntake(event: SubmitEvent) {
    event.preventDefault();

    if (data.isDemo) {
      intakeMessage = 'Demo inventory is not saved.';
      return;
    }

    const parsedCost = Number(intakeCost);
    const parsedQuantity = Number(intakeQuantity);
    const keepOpen = (event.submitter as HTMLButtonElement | null)?.dataset.action === 'add-another';

    if (!intakeTitle.trim() || !Number.isFinite(parsedCost) || parsedCost < 0) {
      intakeMessage = 'Enter a title and valid purchase cost.';
      return;
    }
    if (!Number.isInteger(parsedQuantity) || parsedQuantity < 1 || parsedQuantity > 50) {
      intakeMessage = 'Quantity must be between 1 and 50.';
      return;
    }
    if (intakeAutoSku && !/^[A-Z0-9]{2,8}$/.test(normalizedPrefix(intakePrefix))) {
      intakeMessage = 'SKU prefix must be 2–8 letters or numbers.';
      return;
    }
    if (!intakeAutoSku && parsedQuantity > 1) {
      intakeMessage = 'Batch intake needs automatic SKUs so each item gets its own identity.';
      return;
    }

    intakeSaving = true;
    intakeMessage = null;

    const response = await fetch('/api/inventory', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: intakeTitle.trim(),
        sku: intakeAutoSku ? null : intakeSku.trim(),
        autoSku: intakeAutoSku,
        skuPrefix: normalizedPrefix(intakePrefix),
        quantity: parsedQuantity,
        category: intakeCategory,
        purchaseCostCents: Math.round(parsedCost * 100),
        costMode: intakeCostMode,
        source: intakeSource.trim() || null,
        storageLocation: intakeLocation.trim() || null,
        purchasedAt: intakeDate || null,
        conditionName: intakeCondition.trim() || null
      })
    });

    intakeSaving = false;

    const result = await response.json().catch(() => null) as {
      error?: string;
      skus?: string[];
      count?: number;
    } | null;

    if (!response.ok) {
      intakeMessage = result?.error ?? 'Could not add this inventory item.';
      return;
    }

    const addedSkus = result?.skus ?? [];
    const count = result?.count ?? (addedSkus.length || 1);

    await invalidateAll();

    if (!keepOpen) {
      intakeOpen = false;
      return;
    }

    const skuSummary = addedSkus.length === 1
      ? addedSkus[0]
      : addedSkus.length > 1
        ? `${addedSkus[0]}–${addedSkus[addedSkus.length - 1]}`
        : `${count} item${count === 1 ? '' : 's'}`;

    // Keep the lot-level details for rapid intake; clear the item-specific ones.
    intakeTitle = '';
    intakeCost = '';
    intakeCostMode = 'each';
    intakeCondition = '';
    intakeQuantity = '1';
    intakeSku = '';
    intakeMessage = `Added ${skuSummary}. Ready for the next item.`;
  }

  async function deleteInventoryItem() {
    if (!editing) return;
    if (data.isDemo) {
      saveMessage = 'Demo inventory is not saved.';
      return;
    }
    if (!confirm(`Delete "${editing.title}" from Sellquity inventory?`)) return;

    deletingInventory = true;
    saveMessage = null;

    const response = await fetch(`/api/inventory/${encodeURIComponent(editing.id)}`, {
      method: 'DELETE'
    });

    deletingInventory = false;

    if (!response.ok) {
      const result = await response.json().catch(() => null) as { error?: string } | null;
      saveMessage = result?.error ?? 'Could not delete this inventory item.';
      return;
    }

    editing = null;
    await invalidateAll();
  }

  async function saveSaleCost(sale: SaleRow) {
    if (!sale.inventoryItemId) {
      costMessage = 'This sale is not linked to an inventory item yet.';
      return;
    }
    if (data.isDemo) {
      costMessage = 'Demo costs are not saved.';
      return;
    }

    const raw = costDrafts[sale.id] ?? '';
    const parsed = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(parsed) || parsed < 0) {
      costMessage = 'Enter a valid purchase cost.';
      return;
    }

    const item = data.inventory.find((candidate) => candidate.id === sale.inventoryItemId);
    savingCostId = sale.id;
    costMessage = null;

    const response = await fetch(`/api/inventory/${encodeURIComponent(sale.inventoryItemId)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        purchaseCostCents: Math.round(parsed * 100),
        source: item?.source ?? null,
        storageLocation: item?.location ?? null
      })
    });

    savingCostId = null;

    if (!response.ok) {
      const result = await response.json().catch(() => null) as { error?: string } | null;
      costMessage = result?.error ?? 'Could not save this cost.';
      return;
    }

    delete costDrafts[sale.id];
    selectedSale = null;
    await invalidateAll();
  }

  async function saveExpense(event: SubmitEvent) {
    event.preventDefault();
    if (data.isDemo) {
      expenseMessage = 'Demo expenses are not saved.';
      return;
    }

    const parsedAmount = Number(expenseAmount);
    if (!expenseDate || !expenseDescription.trim() || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      expenseMessage = 'Enter a date, description, and amount greater than $0.';
      return;
    }

    savingExpense = true;
    expenseMessage = null;

    const response = await fetch('/api/expenses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        date: expenseDate,
        description: expenseDescription.trim(),
        category: expenseCategory,
        amountCents: Math.round(parsedAmount * 100),
        memo: expenseMemo.trim() || null
      })
    });

    savingExpense = false;

    if (!response.ok) {
      const result = await response.json().catch(() => null) as { error?: string } | null;
      expenseMessage = result?.error ?? 'Could not save this expense.';
      return;
    }

    expenseDescription = '';
    expenseAmount = '';
    expenseMemo = '';
    expenseMessage = 'Expense saved.';
    await invalidateAll();
  }

  async function deleteExpense(transaction: AccountingTransactionRow) {
    if (data.isDemo) {
      expenseMessage = 'Demo expenses are not saved.';
      return;
    }
    if (!confirm(`Delete "${transaction.description ?? 'this expense'}"?`)) return;

    deletingExpenseId = transaction.id;
    expenseMessage = null;

    const response = await fetch(`/api/expenses/${encodeURIComponent(transaction.id)}`, {
      method: 'DELETE'
    });

    deletingExpenseId = null;

    if (!response.ok) {
      const result = await response.json().catch(() => null) as { error?: string } | null;
      expenseMessage = result?.error ?? 'Could not delete this expense.';
      return;
    }

    expenseMessage = 'Expense deleted.';
    await invalidateAll();
  }

  function csvCell(value: string | number | null | undefined) {
    const text = value == null ? '' : String(value);
    return `"${text.replace(/"/g, '""')}"`;
  }

  function downloadCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
    const csv = [
      headers.map(csvCell).join(','),
      ...rows.map((row) => row.map(csvCell).join(','))
    ].join('\r\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function reportSuffix() {
    const { start, end } = dateRange();
    const channel = channelFilter === 'all' ? 'all-channels' : channelFilter;
    if (!start && !end) return `${channel}-all-time`;
    const format = (date: Date | null) => date ? date.toISOString().slice(0, 10) : 'open';
    return `${channel}-${format(start)}_to_${format(end)}`;
  }

  function exportPnl() {
    downloadCsv(
      `sellquity-pnl-${reportSuffix()}.csv`,
      ['Month', 'Sales', 'Gross revenue', 'Marketplace fees', 'Shipping labels', 'Refunds/disputes', 'Other adjustments', 'Business expenses', 'COGS', 'Missing COGS', 'Net profit', 'Margin %'],
      monthlyRows.map((row) => [
        row.label,
        row.sales,
        (row.gross / 100).toFixed(2),
        (row.sellingFees / 100).toFixed(2),
        (row.shippingLabels / 100).toFixed(2),
        (row.refundsDisputes / 100).toFixed(2),
        (row.otherAdjustments / 100).toFixed(2),
        (row.businessExpenses / 100).toFixed(2),
        (row.cogs / 100).toFixed(2),
        row.missingCogs,
        (row.profit / 100).toFixed(2),
        row.margin.toFixed(2)
      ])
    );
  }

  function exportSales() {
    downloadCsv(
      `sellquity-sales-${reportSuffix()}.csv`,
      ['Sold date', 'Marketplace', 'Order ID', 'External item ID', 'Title', 'Item price', 'Buyer shipping', 'Selling fees', 'Shipping label', 'Refunds', 'Disputes', 'Other adjustments', 'COGS', 'Profit', 'Margin %', 'ROI %'],
      filteredSales.map((sale) => [
        sale.soldAt,
        marketplaceLabel(saleProvider(sale)),
        sale.ebayOrderId,
        sale.ebayItemId,
        sale.title,
        (sale.salePriceCents / 100).toFixed(2),
        (sale.shippingChargedCents / 100).toFixed(2),
        (sale.sellingFeesCents / 100).toFixed(2),
        (sale.shippingLabelCents / 100).toFixed(2),
        (sale.refundsCents / 100).toFixed(2),
        (sale.disputesCents / 100).toFixed(2),
        (sale.otherAdjustmentsCents / 100).toFixed(2),
        sale.cogsCents == null ? '' : (sale.cogsCents / 100).toFixed(2),
        (sale.netProfitCents / 100).toFixed(2),
        sale.margin.toFixed(2),
        sale.roi == null ? '' : sale.roi.toFixed(2)
      ])
    );
  }

  function exportExpenses() {
    downloadCsv(
      `sellquity-expenses-${reportSuffix()}.csv`,
      ['Date', 'Description', 'Category', 'Amount', 'Note'],
      manualExpenses.map((expense) => [
        expense.transactionDate,
        expense.description,
        expenseCategoryLabel(expense.expenseCategory),
        (Math.abs(expense.amountCents) / 100).toFixed(2),
        expense.memo
      ])
    );
  }

  function exportLedger() {
    downloadCsv(
      `sellquity-ledger-${reportSuffix()}.csv`,
      ['Date', 'Marketplace', 'Category', 'Type', 'Description', 'Order ID', 'Fee type', 'Amount', 'Source', 'Expense category', 'Memo', 'Payout ID', 'Reference ID'],
      filteredTransactions.map((transaction) => [
        transaction.transactionDate,
        transactionChannelLabel(transaction),
        transaction.category,
        transaction.transactionType,
        transaction.description,
        transaction.ebayOrderId,
        transaction.feeType,
        (transaction.amountCents / 100).toFixed(2),
        transaction.source,
        transaction.expenseCategory ? expenseCategoryLabel(transaction.expenseCategory) : '',
        transaction.memo,
        transaction.payoutId,
        transaction.referenceId
      ])
    );
  }

  function printReport() {
    window.print();
  }

  async function saveWorkspace(event: SubmitEvent) {
    event.preventDefault();
    if (data.isDemo) {
      workspaceMessage = 'Demo workspace settings are read-only.';
      return;
    }

    workspaceSaving = true;
    workspaceMessage = null;

    const response = await fetch('/api/workspace', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: workspaceName.trim() })
    });

    workspaceSaving = false;

    if (!response.ok) {
      const result = await response.json().catch(() => null) as { error?: string } | null;
      workspaceMessage = result?.error ?? 'Could not update the workspace.';
      return;
    }

    workspaceMessage = 'Workspace updated.';
    await invalidateAll();
  }

  async function signOutOfNettiva() {
    await authClient.signOut();
    window.location.assign('/login');
  }

  async function syncNow() {
    syncing = true;
    const response = await fetch('/api/ebay/sync', { method: 'POST' });
    if (response.redirected) window.location.href = response.url;
    else {
      syncing = false;
      await invalidateAll();
    }
  }
</script>

<svelte:head>
  <title>Sellquity · Resale intelligence</title>
</svelte:head>

<div class="app-shell">
  <aside class="sidebar">
    <div class="brand sellquity-brand">
      <span class="brand-mark sellquity-brand-mark">
        <img src="/s-no-bg.png" alt="" aria-hidden="true" />
      </span>
      <div><strong>SELLQUITY</strong><small>Resale intelligence</small></div>
    </div>

    <nav aria-label="Primary navigation">
      {#each navItems as item}
        {@const Icon = item.icon}
        <button class:active={view === item.view} onclick={() => view = item.view}>
          <Icon size={19} />
          <span>{item.label}</span>
          {#if view === item.view}<ChevronRight class="nav-arrow" size={15} />{/if}
        </button>
        {#if item.view === 'inventory'}
          <a class="nav-route" href="/listing-prep">
            <ClipboardCheck size={19} />
            <span>Listing Prep</span>
          </a>
        {/if}
      {/each}
    </nav>

    <div class="sidebar-foot workspace-foot">
      <div class:online={data.connected} class="connection-dot"></div>
      <div>
        <strong>{workspaceSafe.name}</strong>
        <small>{data.hasImportedData ? 'eBay resale workspace' : data.connected ? 'eBay workspace' : 'Demo workspace'} · {workspaceSafe.role}</small>
      </div>
    </div>
  </aside>

  <main class="main-panel">
    <header class="topbar">
      <div>
        <span class="eyebrow">{view === 'dashboard' ? 'EBAY OPERATIONS' : view === 'settings' ? 'SETUP' : view === 'accounting' ? 'MONEY DESK' : view === 'reports' ? 'REPORTING DESK' : 'SELLER COMMAND CENTER'}</span>
        <h1>{navItems.find((item) => item.view === view)?.label}</h1>
      </div>
      <div class="top-actions">
        <span class="workspace-chip"><span>{workspaceSafe.name}</span><small>{workspaceSafe.plan}</small></span>
        {#if data.isDemo}
          <span class="demo-badge">Demo data</span>
        {:else if !data.financialsComplete}
          <span class="demo-badge">Fees pending</span>
        {:else if headerMissingCogs > 0 && ['dashboard', 'sales', 'accounting', 'reports'].includes(view)}
          <span class="demo-badge">{headerMissingCogs} COGS missing</span>
        {/if}
        <a class="button secondary" href="/import"><FileSpreadsheet size={17} /> Import eBay CSV</a>
        {#if data.connected}
          <button class="button secondary" onclick={syncNow} disabled={syncing}>
            {#if syncing}<LoaderCircle class="spin" size={17} />{:else}<RefreshCw size={17} />{/if}
            Sync eBay
          </button>
        {/if}
      </div>
    </header>

    {#if view === 'dashboard' || view === 'sales' || view === 'accounting' || view === 'reports'}
      <div class="date-toolbar">
        <span><CalendarDays size={15} /> Reporting period</span>
        <div class="date-presets">
          {#each [
            ['all', 'All time'],
            ['30d', '30 days'],
            ['this-month', 'This month'],
            ['last-month', 'Last month'],
            ['ytd', 'YTD'],
            ['custom', 'Custom']
          ] as preset}
            <button
              class:active={datePreset === preset[0]}
              onclick={() => datePreset = preset[0] as DatePreset}
            >{preset[1]}</button>
          {/each}
        </div>
        {#if datePreset === 'custom'}
          <div class="custom-dates">
            <input aria-label="Start date" type="date" bind:value={customStart} />
            <span>to</span>
            <input aria-label="End date" type="date" bind:value={customEnd} />
          </div>
        {/if}

        {#if view !== 'dashboard'}
          <span class="toolbar-divider" aria-hidden="true"></span>
          <span><ShoppingBag size={15} /> Channel</span>
          <div class="channel-presets" role="group" aria-label="Filter reporting channel">
            <button class:active={channelFilter === 'all'} onclick={() => channelFilter = 'all'}>All channels</button>
            <button class:active={channelFilter === 'ebay'} onclick={() => channelFilter = 'ebay'}>eBay</button>
            <button class:active={channelFilter === 'whatnot'} onclick={() => channelFilter = 'whatnot'}>Whatnot</button>
          </div>
          {#if channelFilter !== 'all'}
            <span class="channel-scope-note">Business-wide manual expenses excluded from channel-only profit.</span>
          {/if}
        {/if}
      </div>
    {/if}

    {#if view === 'dashboard'}
      <div class="view-stack ebay-dashboard">
        <section class="metrics-grid ebay-metrics" aria-label="eBay business summary">
          <article class="metric-card tone-green">
            <div class="metric-top"><span>eBay gross sales</span><CircleDollarSign size={18} /></div>
            <strong>{money(dashboardMetrics.gross)}</strong>
            <p>{dashboardSales.length} sale{dashboardSales.length === 1 ? '' : 's'} in this period</p>
          </article>
          <article class="metric-card tone-blue">
            <div class="metric-top"><span>eBay net profit</span><TrendingUp size={18} /></div>
            <strong>{money(dashboardMetrics.profit)}</strong>
            <p>{dashboardProfitIsFinal ? `${percent(dashboardMetrics.margin)} true margin` : dashboardMetrics.missingCogs ? `${dashboardMetrics.missingCogs} sale cost${dashboardMetrics.missingCogs === 1 ? '' : 's'} still needed` : 'Financial data still reconciling'}</p>
          </article>
          <article class="metric-card tone-violet">
            <div class="metric-top"><span>Inventory invested</span><Boxes size={18} /></div>
            <strong>{money(inventoryCostBasis)}</strong>
            <p>{unsoldItems.length} unsold item{unsoldItems.length === 1 ? '' : 's'} carrying COGS</p>
          </article>
          <article class="metric-card tone-amber">
            <div class="metric-top"><span>Active listings</span><ShoppingBag size={18} /></div>
            <strong>{activeItems.length}</strong>
            <p>{money(activeValue)} current asking value</p>
          </article>
        </section>

        <section class="dashboard-grid ebay-operating-grid">
          <article class="panel dashboard-sales-panel">
            <div class="panel-heading">
              <div><span class="kicker">RECENT EBAY SALES</span><h2>What sold</h2></div>
              <button onclick={() => { channelFilter = 'ebay'; view = 'sales'; }}>View sales <ChevronRight size={16} /></button>
            </div>
            {#if dashboardSales.length}
              <div class="dashboard-sale-list">
                {#each dashboardSales.slice(0, 5) as sale}
                  <button class="dashboard-sale-row" type="button" onclick={() => selectedSale = sale}>
                    <span class="dashboard-sale-main"><strong>{sale.title}</strong><small>{shortDate(sale.soldAt)} · {sale.ebayOrderId}</small></span>
                    <span class="dashboard-sale-money"><small>Gross</small><strong>{money(sale.salePriceCents + sale.shippingChargedCents)}</strong></span>
                    <span class:missing={sale.cogsCents == null} class="dashboard-sale-profit"><small>{sale.cogsCents == null ? 'COGS missing' : `${percent(sale.margin)} margin`}</small><strong>{money(sale.netProfitCents)}</strong></span>
                    <ChevronRight size={16} />
                  </button>
                {/each}
              </div>
              <div class="margin-footer"><ArrowUpRight size={17} /><span><strong>{percent(dashboardMetrics.margin)}</strong> {dashboardProfitIsFinal ? 'eBay margin after fees and COGS' : 'current eBay margin while costs reconcile'}</span></div>
            {:else}
              <div class="empty-state"><strong>No eBay sales in this period.</strong>Try a wider reporting range.</div>
            {/if}
          </article>

          <article class="panel attention-panel ebay-action-panel">
            <div class="panel-heading"><div><span class="kicker">TODAY</span><h2>Next actions</h2></div><PackageCheck size={20} /></div>
            <a class="dashboard-action-link" href="/listing-prep">
              <span class="attention-icon blue"><ClipboardCheck size={17} /></span>
              <span><strong>{unlistedCount} item{unlistedCount === 1 ? '' : 's'} waiting to list</strong><small>{money(unlistedInvestment)} in unlisted inventory COGS</small></span>
              <ChevronRight size={17} />
            </a>
            <button onclick={() => { filter = 'active'; view = 'inventory'; }}>
              <span class="attention-icon red"><Clock3 size={17} /></span>
              <span><strong>{stale} listing{stale === 1 ? '' : 's'} over 90 days</strong><small>{stale ? 'Review price, listing, or storage position' : `${avgAge} day average listing age`}</small></span>
              <ChevronRight size={17} />
            </button>
            <button onclick={openCogsQueue}>
              <span class="attention-icon amber"><Tag size={17} /></span>
              <span><strong>{dashboardMetrics.missingCogs} eBay sale cost{dashboardMetrics.missingCogs === 1 ? '' : 's'} missing</strong><small>{dashboardMetrics.missingCogs ? 'Finish COGS to lock true profit' : 'Sold inventory is fully costed'}</small></span>
              <ChevronRight size={17} />
            </button>
            <a class="dashboard-action-link" href="/import">
              <span class="attention-icon teal"><FileSpreadsheet size={17} /></span>
              <span><strong>{latestEbayDataAt ? `eBay data through ${shortDate(latestEbayDataAt)}` : 'Import your first eBay Transaction report'}</strong><small>{latestEbayDataAt ? 'Drop a newer Seller Hub report when you want to reconcile new sales' : 'Seller Hub CSV is the active Sellquity data feed'}</small></span>
              <ChevronRight size={17} />
            </a>
          </article>
        </section>

        <section class="panel inventory-pulse-panel">
          <div class="panel-heading table-heading">
            <div><span class="kicker">INVENTORY PULSE</span><h2>What your money is doing</h2></div>
            <div class="pulse-actions"><a href="/purchase-lots">Purchase lots <ChevronRight size={14} /></a><button onclick={() => view = 'inventory'}>Open inventory <ChevronRight size={14} /></button></div>
          </div>
          <div class="inventory-pulse-stats">
            <span><small>Waiting to list</small><strong>{unlistedCount}</strong><em>{money(unlistedInvestment)} cost basis</em></span>
            <span><small>Active asking value</small><strong>{money(activeValue)}</strong><em>{activeItems.length} live listing{activeItems.length === 1 ? '' : 's'}</em></span>
            <span><small>Average listing age</small><strong>{avgAge}d</strong><em>{stale ? `${stale} over 90 days` : 'No stale listings'}</em></span>
            <span><small>Total inventory invested</small><strong>{money(inventoryCostBasis)}</strong><em>{unsoldItems.length} unsold item{unsoldItems.length === 1 ? '' : 's'}</em></span>
          </div>
          {#if activeItems.length}
            <div class="pulse-table-heading"><span>Oldest active listings</span><small>These deserve your attention first.</small></div>
            {@render inventoryTable([...activeItems].sort((a, b) => b.ageDays - a.ageDays).slice(0, 5), false)}
          {:else}
            <div class="empty-state"><strong>No active listings yet.</strong>Move an item through Listing Prep and mark it listed to start tracking asking value and listing age.</div>
          {/if}
        </section>
      </div>

    {:else if view === 'inventory'}
      <div class="inventory-view-stack">
        <section class="inventory-summary sku-aware-summary">
          <div><span>Unlisted intake</span><strong>{unlistedCount}</strong><small>waiting to list</small></div>
          <div><span>Scheduled</span><strong>{scheduledItems.length}</strong><small>future marketplace listings</small></div>
          <div><span>Active listings</span><strong>{activeItems.length}</strong><small>{money(activeValue)} listed</small></div>
          <div><span>Inventory cost basis</span><strong>{money(inventoryCostBasis)}</strong><small>unsold purchase cost</small></div>
          <div class="inventory-summary-actions">
            <a class="button secondary" href="/purchase-lots"><ShoppingBag size={17} /> Purchase lots</a>
            <a class="button secondary" href="/listing-prep"><ClipboardCheck size={17} /> Listing prep</a>
            <a class="button secondary" href="/categories"><Settings size={17} /> Categories</a>
            <button class="button secondary" onclick={() => skuManagerOpen = true}><Archive size={17} /> SKU manager</button>
            <button class="button primary" onclick={openIntake}><Tag size={17} /> Add inventory</button>
          </div>
        </section>

        <section class="panel inventory-intelligence-panel">
          <div class="panel-heading table-heading">
            <div>
              <span class="kicker">INVENTORY INTELLIGENCE</span>
              <h2>Where your money is getting stuck</h2>
            </div>
            <span class="inventory-health-score">
              {inventoryHealthSummary.sellThrough.toFixed(0)}% tracked sell-through
            </span>
          </div>

          <div class="inventory-risk-grid">
            <button type="button" onclick={() => { filter = 'unlisted'; inventoryAgeBucket = 'all'; inventorySort = 'unlisted-oldest'; }}>
              <span>Unlisted 30+ days</span>
              <strong>{unlistedOver30.length}</strong>
              <small>{money(unlistedOver30Cogs)} tied up</small>
            </button>
            <button type="button" onclick={() => { filter = 'active'; inventoryAgeBucket = '61-90'; inventorySort = 'oldest'; }}>
              <span>Active 61–90 days</span>
              <strong>{activeItems.filter((item) => item.ageDays >= 61 && item.ageDays <= 90).length}</strong>
              <small>{money(activeItems.filter((item) => item.ageDays >= 61 && item.ageDays <= 90).reduce((sum, item) => sum + (item.costCents ?? 0), 0))} COGS</small>
            </button>
            <button class:danger={stale > 0} type="button" onclick={() => { filter = 'active'; inventoryAgeBucket = '90+'; inventorySort = 'oldest'; }}>
              <span>Dead-stock watch</span>
              <strong>{stale}</strong>
              <small>{money(staleCogs)} COGS at 91+ days</small>
            </button>
            <button type="button" onclick={() => { filter = 'all'; inventoryAgeBucket = 'all'; inventorySort = 'highest-cost'; }}>
              <span>Total unsold capital</span>
              <strong>{money(inventoryCostBasis)}</strong>
              <small>{unsoldItems.length} items ranked by COGS</small>
            </button>
          </div>

          <div class="aging-strip">
            <span class="aging-title">Active listing age</span>
            <button class:active={inventoryAgeBucket === '0-30'} type="button" onclick={() => setInventoryAgeBucket('0-30')}>
              <strong>0–30d</strong><small>{activeAgeBuckets.fresh.count} · {money(activeAgeBuckets.fresh.asking)} ask</small>
            </button>
            <button class:active={inventoryAgeBucket === '31-60'} type="button" onclick={() => setInventoryAgeBucket('31-60')}>
              <strong>31–60d</strong><small>{activeAgeBuckets.warming.count} · {money(activeAgeBuckets.warming.asking)} ask</small>
            </button>
            <button class:active={inventoryAgeBucket === '61-90'} type="button" onclick={() => setInventoryAgeBucket('61-90')}>
              <strong>61–90d</strong><small>{activeAgeBuckets.aging.count} · {money(activeAgeBuckets.aging.asking)} ask</small>
            </button>
            <button class:danger={activeAgeBuckets.stale.count > 0} class:active={inventoryAgeBucket === '90+'} type="button" onclick={() => setInventoryAgeBucket('90+')}>
              <strong>91+d</strong><small>{activeAgeBuckets.stale.count} · {money(activeAgeBuckets.stale.asking)} ask</small>
            </button>
            {#if inventoryAgeBucket !== 'all'}
              <button class="aging-clear" type="button" onclick={() => inventoryAgeBucket = 'all'}>Clear age</button>
            {/if}
          </div>
        </section>

        <section class="panel inventory-panel">
          <div class="inventory-tools">
            <label class="search-field"><Search size={18} /><span class="sr-only">Search inventory</span><input bind:value={query} placeholder="Search title, SKU, bin, source, condition…" /></label>
            <label class="inventory-category-filter">
              <span class="sr-only">Filter by category</span>
              <select bind:value={inventoryCategoryFilter}>
                <option value="all">All categories</option>
                {#each enabledInventoryCategories as category}
                  <option value={category.value}>{category.label}</option>
                {/each}
              </select>
            </label>
            <label class="inventory-location-filter">
              <span class="sr-only">Filter by storage location</span>
              <select bind:value={inventoryLocationFilter}>
                <option value="all">All locations</option>
                <option value="__unset__">Location not set</option>
                {#each inventoryLocations as inventoryLocation}
                  <option value={inventoryLocation}>{inventoryLocation}</option>
                {/each}
              </select>
            </label>
            <label class="inventory-sort-filter">
              <span class="sr-only">Sort inventory</span>
              <select bind:value={inventorySort}>
                <option value="default">Default sort</option>
                <option value="oldest">Oldest active first</option>
                <option value="highest-cost">Highest COGS first</option>
                <option value="highest-ask">Highest asking value</option>
                <option value="unlisted-oldest">Unlisted oldest first</option>
              </select>
            </label>
            <div class="filter-tabs" role="group" aria-label="Filter inventory">
              {#each ['all', 'active', 'scheduled', 'unlisted', 'sold'] as value}
                <button
                  class:active={filter === value}
                  onclick={() => {
                    filter = value as Filter;
                    if (value !== 'active') inventoryAgeBucket = 'all';
                  }}
                >{value}</button>
              {/each}
            </div>
          </div>

          <div class:active={selectedInventoryIds.length > 0} class="inventory-selection-bar">
            <div>
              <strong>{selectedInventoryIds.length ? `${selectedInventoryIds.length} items selected` : 'Bulk inventory tools'}</strong>
              <small>
                {selectedInventoryIds.length
                  ? `${selectedInventoryItems.filter((item) => item.status !== 'sold').length} unsold · ${selectedInventoryItems.filter((item) => item.status === 'sold').length} sold`
                  : 'Select rows to move bins or update shared purchase details.'}
              </small>
            </div>
            <span class="selection-spacer"></span>
            {#if selectedInventoryIds.length}
              <button class="button mini primary" type="button" onclick={openBulkInventoryEditor}><Boxes size={14} /> Bulk edit</button>
              <button class="button mini secondary" type="button" onclick={clearInventorySelection}>Clear selection</button>
            {:else}
              <button class="button mini secondary" type="button" onclick={toggleFilteredInventorySelection}>
                {`Select filtered (${filteredInventory.length})`}
              </button>
            {/if}
          </div>

        {#if filteredInventory.length}
          {@render inventoryTable(filteredInventory, true)}
        {:else}
          <div class="empty-state"><strong>No inventory matches this view.</strong>Add inventory or use Listing Prep to manually track eBay listings while API access is pending.</div>
        {/if}
        </section>
      </div>

    {:else if view === 'sales'}
      <section class="panel sales-panel">
        <div class="panel-heading table-heading">
          <div>
            <span class="kicker">{profitIsFinal ? 'RECONCILED ORDERS' : 'PROFIT WORKBENCH'}</span>
            <h2>{profitIsFinal ? 'True profit' : 'Sales requiring final cost review'}</h2>
          </div>
          <span class:data-warning={!profitIsFinal} class="read-only">
            {#if profitIsFinal}<Check size={14} /> Fully costed{:else}<AlertTriangle size={14} /> {metrics.missingCogs} COGS missing{/if}
          </span>
        </div>
        {#if filteredSales.length}
          <div class="table-wrap"><table><thead><tr>
            <th>Item</th><th>Sold</th><th class="num">Gross</th><th class="num">Fees + adjustments</th>
            <th class="num">COGS</th><th class="num">Profit</th><th class="num">Margin</th><th class="num">ROI</th>
          </tr></thead><tbody>
            {#each filteredSales as sale}
              <tr>
                <td>
                  <button class="sale-button" onclick={() => selectedSale = sale}>
                    <span class="sale-title-line">
                      <strong>{sale.title}</strong>
                      <span class:whatnot={saleProvider(sale) === 'whatnot'} class="marketplace-pill">
                        {marketplaceLabel(saleProvider(sale))}
                      </span>
                    </span>
                    <small>{sale.ebayOrderId} · View breakdown →</small>
                  </button>
                </td>
                <td>{shortDate(sale.soldAt)}</td>
                <td class="num">{money(sale.salePriceCents + sale.shippingChargedCents)}</td>
                <td class="num negative">−{money(Math.max(0, -sale.pnlAdjustmentsCents))}</td>
                <td class:missing={sale.cogsCents == null} class="num">
                  {#if sale.cogsCents == null}<span class="cost-missing-pill">Missing</span>{:else}−{money(sale.cogsCents)}{/if}
                </td>
                <td class="num profit">{money(sale.netProfitCents)}</td>
                <td class="num">{percent(sale.margin)}</td>
                <td class="num">{sale.roi == null ? '—' : percent(sale.roi)}</td>
              </tr>
            {/each}
          </tbody></table></div>
        {:else}
          <div class="empty-state"><strong>No sales in this period.</strong>Choose another reporting range.</div>
        {/if}
      </section>

    {:else if view === 'accounting'}
      <div class="accounting-stack">
        <section class="metrics-grid" aria-label="Accounting summary">
          <article class="metric-card tone-green"><div class="metric-top"><span>Gross revenue</span><CircleDollarSign size={18} /></div><strong>{money(metrics.gross)}</strong><p>{filteredSales.length} sales</p></article>
          <article class="metric-card tone-blue"><div class="metric-top"><span>Marketplace fees</span><ReceiptText size={18} /></div><strong>{money(metrics.sellingFees)}</strong><p>Platform fees in period</p></article>
          <article class="metric-card tone-violet"><div class="metric-top"><span>Shipping labels</span><PackageCheck size={18} /></div><strong>{money(metrics.shippingLabels)}</strong><p>Seller-paid postage</p></article>
          <article class="metric-card tone-amber"><div class="metric-top"><span>{profitLabel}</span><WalletCards size={18} /></div><strong>{money(metrics.profit)}</strong><p>{profitIsFinal ? `${percent(metrics.margin)} true margin` : `${metrics.missingCogs} missing COGS`}</p></article>
        </section>

        <section class="accounting-grid">
          <article class="panel accounting-summary">
            <div class="panel-heading"><div><span class="kicker">PROFIT & LOSS</span><h2>Where the money went</h2></div><BarChart3 size={20} /></div>
            <div class="pnl-list">
              <div class="pnl-row"><span>Gross sales + buyer shipping</span><strong class="credit">+{money(metrics.gross)}</strong></div>
              <div class="pnl-row"><span>Marketplace fees</span><strong class="debit">−{money(metrics.sellingFees)}</strong></div>
              <div class="pnl-row"><span>Shipping labels</span><strong class="debit">−{money(metrics.shippingLabels)}</strong></div>
              <div class="pnl-row"><span>Refunds & disputes</span><strong class="debit">−{money(metrics.refundsDisputes)}</strong></div>
              <div class="pnl-row"><span>Other fees / credits / adjustments</span><strong class:credit={metrics.otherAdjustments >= 0} class:debit={metrics.otherAdjustments < 0}>{formatSigned(metrics.otherAdjustments)}</strong></div>
              <div class="pnl-row"><span>Business expenses</span><strong class="debit">−{money(metrics.businessExpenses)}</strong></div>
              <div class="pnl-row"><span>Known COGS</span><strong class="debit">−{money(metrics.cogs)}</strong></div>
              <div class="pnl-row total"><span>{profitLabel}</span><strong>{money(metrics.profit)}</strong></div>
            </div>
            {#if !profitIsFinal}
              <div class="accounting-note">
                <Info size={17} />
                <span>{!data.financialsComplete ? 'Financial transactions are not fully loaded yet.' : `${metrics.missingCogs} sale${metrics.missingCogs === 1 ? '' : 's'} still need purchase cost. Sellquity is intentionally not calling this true net profit yet.`}</span>
              </div>
            {/if}
          </article>

          <article class="panel cogs-panel">
            <div class="panel-heading">
              <div><span class="kicker">COGS DESK</span><h2>Missing purchase costs</h2></div>
              {#if missingSaleCosts.length}
                <span class="read-only">{missingSaleCosts.length} missing</span>
              {:else}
                <Tag size={20} />
              {/if}
            </div>
            {#if missingSaleCosts.length}
              <div class="cogs-list">
                {#each missingSaleCosts.slice(0, 6) as sale}
                  <div class="cogs-row">
                    <div class="cogs-row-copy">
                      <strong>{sale.title}</strong>
                      <small>{shortDate(sale.soldAt)} · gross {money(sale.salePriceCents + sale.shippingChargedCents)}</small>
                    </div>
                    <label class="cogs-input">
                      <span>$</span>
                      <input
                        aria-label={`Purchase cost for ${sale.title}`}
                        inputmode="decimal"
                        placeholder="0.00"
                        value={costDrafts[sale.id] ?? ''}
                        oninput={(event) => costDrafts[sale.id] = event.currentTarget.value}
                      />
                    </label>
                    <button class="button mini primary" disabled={savingCostId === sale.id} onclick={() => saveSaleCost(sale)}>
                      {#if savingCostId === sale.id}<LoaderCircle class="spin" size={14} />{:else}<Check size={14} />{/if}
                      Save
                    </button>
                  </div>
                {/each}
              </div>

              <div class="panel-heading table-heading">
                <span class="read-only">
                  Showing {Math.min(6, missingSaleCosts.length)} of {missingSaleCosts.length}
                </span>
                <a class="button mini secondary" href="/cogs">
                  View all missing costs <ChevronRight size={14} />
                </a>
              </div>

              {#if costMessage}<p class="queue-note">{costMessage}</p>{/if}
            {:else}
              <div class="cogs-complete"><Check size={18} /> Every sale in this period has a purchase cost.</div>
            {/if}
          </article>
        </section>

        <section class="panel purchase-accounting-panel">
          <div class="panel-heading table-heading purchase-accounting-heading">
            <div>
              <span class="kicker">INVENTORY CAPITAL</span>
              <h2>Purchase cash vs. recognized COGS</h2>
            </div>
            <span class="business-wide-pill">Business-wide</span>
          </div>

          <div class="purchase-accounting-stats">
            <span>
              <small>Recorded purchase cash · period</small>
              <strong>{money(purchaseAccountingSummary.purchaseCash)}</strong>
              <em>{purchaseAccountingSummary.purchaseLotsInPeriod} purchase lot{purchaseAccountingSummary.purchaseLotsInPeriod === 1 ? '' : 's'}</em>
            </span>
            <span>
              <small>COGS recognized · period</small>
              <strong>{money(purchaseAccountingSummary.recognizedCogs)}</strong>
              <em>{purchaseAccountingSummary.missingCogs ? `${purchaseAccountingSummary.missingCogs} sale cost${purchaseAccountingSummary.missingCogs === 1 ? '' : 's'} still missing` : 'Known sold-item cost'}</em>
            </span>
            <span>
              <small>Current unsold cost basis</small>
              <strong>{money(purchaseAccountingSummary.unsoldBasis)}</strong>
              <em>{purchaseAccountingSummary.standaloneUnsoldBasis ? `${money(purchaseAccountingSummary.standaloneUnsoldBasis)} entered outside Purchase Lots` : 'Inventory capital still on hand'}</em>
            </span>
            <span>
              <small>Purchase-lot gross recovery</small>
              <strong>{purchaseAccountingSummary.lotRecovery == null ? '—' : percent(purchaseAccountingSummary.lotRecovery)}</strong>
              <em>{purchaseAccountingSummary.recordedLotCost ? `${money(purchaseAccountingSummary.recordedLotGross)} gross on ${money(purchaseAccountingSummary.recordedLotCost)} recorded cost` : 'Starts when Purchase Lots have sales'}</em>
            </span>
          </div>

          <div class="inventory-accounting-flow" aria-label="Inventory accounting flow">
            <span>
              <b>1</b>
              <small>CASH OUT</small>
              <strong>Buy inventory</strong>
              <em>Recorded as inventory capital, not an immediate P&amp;L expense.</em>
            </span>
            <ChevronRight size={17} />
            <span>
              <b>2</b>
              <small>ON HAND</small>
              <strong>Inventory cost basis</strong>
              <em>The cost stays attached to the item while it remains unsold.</em>
            </span>
            <ChevronRight size={17} />
            <span>
              <b>3</b>
              <small>SALE</small>
              <strong>COGS recognized</strong>
              <em>That item's cost enters P&amp;L when the tracked inventory sells.</em>
            </span>
          </div>

          <div class="purchase-lot-heading">
            <div>
              <span class="kicker">PURCHASE LOT PERFORMANCE</span>
              <h3>What each buy has returned so far</h3>
            </div>
            <a class="button mini secondary" href="/purchase-lots">Purchase Lots <ChevronRight size={14} /></a>
          </div>

          {#if purchaseLotAccounting.length}
            <div class="table-wrap">
              <table class="purchase-lot-table">
                <thead>
                  <tr>
                    <th>Purchase lot</th>
                    <th class="num">Paid</th>
                    <th class="num">Items</th>
                    <th class="num">Sold</th>
                    <th class="num">Gross</th>
                    <th class="num">Realized profit</th>
                    <th class="num">Unsold COGS</th>
                    <th class="num">Recovery</th>
                  </tr>
                </thead>
                <tbody>
                  {#each purchaseLotAccounting.slice(0, 12) as lot}
                    <tr>
                      <td>
                        <span class="purchase-lot-name">
                          <strong>{lot.label}</strong>
                          <small>
                            {lot.source ?? 'Source not set'} · {shortDate(lot.purchasedAt ?? lot.createdAt)}
                            {#if lot.missingCogs} · {lot.missingCogs} sale COGS missing{/if}
                          </small>
                        </span>
                      </td>
                      <td class="num">{money(lot.totalCostCents)}</td>
                      <td class="num">{lot.trackedItems || lot.itemCount}</td>
                      <td class="num">{lot.sold}</td>
                      <td class="num">{money(lot.gross)}</td>
                      <td class:negative={lot.realizedProfit < 0} class="num profit">{money(lot.realizedProfit)}</td>
                      <td class="num">{money(lot.unsoldCogs)}</td>
                      <td class:recovered={lot.recovery != null && lot.recovery >= 100} class="num">{lot.recovery == null ? '—' : percent(lot.recovery)}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>

            {#if purchaseLotAccounting.length > 12}
              <div class="purchase-lot-more">Showing the 12 most recent of {purchaseLotAccounting.length} recorded purchase lots.</div>
            {/if}
          {:else}
            <div class="empty-state purchase-empty">
              <strong>No Purchase Lots recorded yet.</strong>
              Your current inventory cost basis still works normally. Future mixed buys entered through Purchase Lots will create a cash-spend trail without double-counting that spend as COGS.
              <a class="button mini secondary" href="/purchase-lots">Record a purchase lot <ChevronRight size={14} /></a>
            </div>
          {/if}

          <div class="purchase-accounting-note">
            <Info size={15} />
            <span>
              This block is business-wide because inventory can move between selling channels. It follows the date range for purchase cash and recognized COGS, while unsold cost basis and lot recovery are current/lifetime values. Purchase Lots do not create operating-expense rows in the P&amp;L.
            </span>
          </div>
        </section>

        <section class="panel expense-manager">
          <div class="panel-heading table-heading">
            <div>
              <span class="kicker">BUSINESS EXPENSES</span>
              <h2>Business-wide operating costs</h2>
            </div>
            <span class="read-only">{money(metrics.businessExpenses)} in period</span>
          </div>

          <form class="expense-form" onsubmit={saveExpense}>
            <label>
              <span>Date</span>
              <input type="date" bind:value={expenseDate} required />
            </label>
            <label class="expense-description">
              <span>Description</span>
              <input bind:value={expenseDescription} maxlength="160" placeholder="Thermal labels, card show table…" required />
            </label>
            <label>
              <span>Category</span>
              <select bind:value={expenseCategory}>
                {#each expenseCategories as option}
                  <option value={option.value}>{option.label}</option>
                {/each}
              </select>
            </label>
            <label class="expense-amount">
              <span>Amount</span>
              <div class="money-input"><span>$</span><input bind:value={expenseAmount} inputmode="decimal" placeholder="0.00" required /></div>
            </label>
            <label class="expense-note">
              <span>Note <small>optional</small></span>
              <input bind:value={expenseMemo} maxlength="500" placeholder="Vendor, receipt, reason…" />
            </label>
            <button class="button primary expense-submit" disabled={savingExpense}>
              {#if savingExpense}<LoaderCircle class="spin" size={16} />{:else}<Check size={16} />{/if}
              Add expense
            </button>
          </form>

          {#if expenseMessage}<p class="expense-message">{expenseMessage}</p>{/if}

          {#if manualExpenses.length}
            <div class="expense-list">
              {#each manualExpenses as expense}
                <div class="expense-row">
                  <div class="expense-date">{shortDate(expense.transactionDate)}</div>
                  <div class="expense-copy">
                    <strong>{expense.description ?? 'Business expense'}</strong>
                    <small>{expenseCategoryLabel(expense.expenseCategory)}{expense.memo ? ` · ${expense.memo}` : ''}</small>
                  </div>
                  <strong class="expense-value">−{money(Math.abs(expense.amountCents))}</strong>
                  <button
                    class="button mini secondary expense-delete"
                    disabled={deletingExpenseId === expense.id}
                    onclick={() => deleteExpense(expense)}
                    type="button"
                  >
                    {#if deletingExpenseId === expense.id}<LoaderCircle class="spin" size={14} />{:else}<X size={14} />{/if}
                    Delete
                  </button>
                </div>
              {/each}
            </div>
          {:else}
            <div class="empty-state compact-empty">
              <strong>No manual expenses in this period.</strong>
              Add costs no marketplace sale owns directly—supplies, software, show fees, equipment, advertising, and more.
            </div>
          {/if}
        </section>

        <section class="panel accounting-ledger">
          <div class="panel-heading table-heading">
            <div><span class="kicker">TRANSACTION LEDGER</span><h2>Marketplace money trail</h2></div>
            <span class="read-only">{filteredTransactions.length} entries</span>
          </div>
          {#if filteredTransactions.length}
            <div class="table-wrap"><table><thead><tr>
              <th>Date</th><th>Channel</th><th>Category</th><th>Description</th><th>Order</th><th class="num">Amount</th><th>P&L</th>
            </tr></thead><tbody>
              {#each filteredTransactions as transaction}
                <tr>
                  <td>{shortDate(transaction.transactionDate)}</td>
                  <td>
                    <span
                      class:whatnot={transactionProvider(transaction) === 'whatnot'}
                      class:manual={transactionProvider(transaction) === 'manual'}
                      class="marketplace-pill"
                    >{transactionChannelLabel(transaction)}</span>
                  </td>
                  <td><span class={`ledger-category ${transaction.category}`}>{categoryLabel(transaction.category)}</span></td>
                  <td class="title-cell">
                    <strong>{transaction.feeType || transaction.description || transaction.transactionType}</strong>
                    <small>{transaction.category === 'business_expense' ? expenseCategoryLabel(transaction.expenseCategory) : transaction.source}{transaction.memo ? ` · ${transaction.memo}` : ''}</small>
                  </td>
                  <td>{transaction.ebayOrderId ?? '—'}</td>
                  <td class:credit={transaction.amountCents > 0} class:debit={transaction.amountCents < 0} class="num ledger-amount">{formatSigned(transaction.amountCents)}</td>
                  <td>{#if excludedFromPnl(transaction.category)}<span class="excluded-pill">Excluded</span>{:else if transaction.category === 'sale'}<span class="excluded-pill">Revenue above</span>{:else}<span class="read-only">Included</span>{/if}</td>
                </tr>
              {/each}
            </tbody></table></div>
          {:else}
            <div class="empty-state"><strong>No ledger activity in this period.</strong>Choose another reporting range.</div>
          {/if}
        </section>
      </div>

    {:else if view === 'reports'}
      <div class="reports-stack">
        <section class="report-hero panel">
          <div>
            <span class="kicker">REPORT CENTER</span>
            <h2>{channelLabel} performance</h2>
            <p>{profitIsFinal ? 'Fully costed accounting report.' : metrics.missingCogs ? `${metrics.missingCogs} sale cost${metrics.missingCogs === 1 ? '' : 's'} missing in this period.` : 'Financial data is still reconciling.'}</p>
          </div>
          <div class="report-actions">
            <button class="button primary" onclick={exportPnl}><Download size={16} /> P&L CSV</button>
            <button class="button secondary" onclick={printReport}><Printer size={16} /> Print / PDF</button>
          </div>
        </section>

        <section class="metrics-grid report-metrics" aria-label="Profit analytics summary">
          <article class="metric-card tone-green">
            <div class="metric-top"><span>Gross revenue</span><CircleDollarSign size={18} /></div>
            <strong>{money(metrics.gross)}</strong>
            <p>{filteredSales.length} sale{filteredSales.length === 1 ? '' : 's'} in this period</p>
          </article>
          <article class="metric-card tone-blue">
            <div class="metric-top"><span>{profitLabel}</span><WalletCards size={18} /></div>
            <strong>{money(metrics.profit)}</strong>
            <p>{percent(metrics.margin)} true business margin</p>
          </article>
          <article class="metric-card tone-violet">
            <div class="metric-top"><span>Avg costed sale profit</span><TrendingUp size={18} /></div>
            <strong>{money(analyticsSummary.averageSaleProfit)}</strong>
            <p>{analyticsSummary.costedSales} fully costed sale{analyticsSummary.costedSales === 1 ? '' : 's'}</p>
          </article>
          <article class="metric-card tone-amber">
            <div class="metric-top"><span>Costed-sale ROI</span><ArrowUpRight size={18} /></div>
            <strong>{analyticsSummary.overallRoi == null ? '—' : percent(analyticsSummary.overallRoi)}</strong>
            <p>{analyticsSummary.missingCogs ? `${analyticsSummary.missingCogs} sale${analyticsSummary.missingCogs === 1 ? '' : 's'} excluded · missing COGS` : 'All sales included'}</p>
          </article>
        </section>

        <section class="analytics-intro panel">
          <div>
            <span class="kicker">BUYING INTELLIGENCE</span>
            <h2>What are you actually good at selling?</h2>
            <p>
              Category and source profit below use sale-level marketplace costs + COGS.
              Business-wide manual expenses are intentionally not assigned to individual categories or sources.
            </p>
          </div>
          {#if analyticsSummary.missingCogs}
            <span class="analytics-warning"><AlertTriangle size={15} /> {analyticsSummary.missingCogs} sale{analyticsSummary.missingCogs === 1 ? '' : 's'} missing COGS</span>
          {:else}
            <span class="analytics-ready"><Check size={15} /> Fully costed rankings</span>
          {/if}
        </section>

        <section class="analytics-split">
          <article class="panel analytics-table-panel">
            <div class="panel-heading table-heading">
              <div><span class="kicker">BY CATEGORY</span><h2>What makes you money</h2></div>
              <Boxes size={19} />
            </div>
            {#if categoryAnalytics.length}
              <div class="table-wrap">
                <table class="analytics-table">
                  <thead><tr>
                    <th>Category</th>
                    <th class="num">Sales</th>
                    <th class="num">Gross</th>
                    <th class="num">Avg profit</th>
                    <th class="num">Profit</th>
                    <th class="num">Margin</th>
                    <th class="num">ROI</th>
                  </tr></thead>
                  <tbody>
                    {#each categoryAnalytics as row}
                      <tr>
                        <td>
                          <span class="analytics-name">
                            <strong>{row.key}</strong>
                            {#if row.missingCogs}<small>{row.missingCogs} COGS missing</small>{/if}
                          </span>
                        </td>
                        <td class="num">{row.sales}</td>
                        <td class="num">{money(row.gross)}</td>
                        <td class="num">{money(row.averageProfit)}</td>
                        <td class:negative={row.profit < 0} class="num profit">{money(row.profit)}</td>
                        <td class:negative={row.margin < 0} class="num">{percent(row.margin)}</td>
                        <td class="num">{row.roi == null ? '—' : percent(row.roi)}</td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            {:else}
              <div class="empty-state"><strong>No category analytics yet.</strong>Sales linked to inventory will appear here.</div>
            {/if}
          </article>

          <article class="panel analytics-table-panel">
            <div class="panel-heading table-heading">
              <div><span class="kicker">BY SOURCE</span><h2>Where the good inventory comes from</h2></div>
              <MapPin size={19} />
            </div>
            {#if sourceAnalytics.length}
              <div class="table-wrap">
                <table class="analytics-table">
                  <thead><tr>
                    <th>Source</th>
                    <th class="num">Sales</th>
                    <th class="num">Gross</th>
                    <th class="num">Avg profit</th>
                    <th class="num">Profit</th>
                    <th class="num">Margin</th>
                    <th class="num">ROI</th>
                  </tr></thead>
                  <tbody>
                    {#each sourceAnalytics as row}
                      <tr>
                        <td>
                          <span class="analytics-name">
                            <strong>{row.key}</strong>
                            {#if row.missingCogs}<small>{row.missingCogs} COGS missing</small>{/if}
                          </span>
                        </td>
                        <td class="num">{row.sales}</td>
                        <td class="num">{money(row.gross)}</td>
                        <td class="num">{money(row.averageProfit)}</td>
                        <td class:negative={row.profit < 0} class="num profit">{money(row.profit)}</td>
                        <td class:negative={row.margin < 0} class="num">{percent(row.margin)}</td>
                        <td class="num">{row.roi == null ? '—' : percent(row.roi)}</td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            {:else}
              <div class="empty-state"><strong>No source analytics yet.</strong>Add a Source to inventory or use Purchase Lots to build sourcing history.</div>
            {/if}
          </article>
        </section>

        <section class="panel winners-panel">
          <div class="panel-heading table-heading">
            <div><span class="kicker">WINNERS &amp; LOSERS</span><h2>The stuff worth remembering</h2></div>
            <TrendingUp size={19} />
          </div>

          {#if costedSaleAnalytics.length}
            <div class="winner-grid">
              <button type="button" class="winner-card good" onclick={() => highestProfitSale && (selectedSale = highestProfitSale.sale)}>
                <span class="winner-label">Highest profit</span>
                <strong>{highestProfitSale?.sale.title ?? '—'}</strong>
                <span class="winner-money">{highestProfitSale ? money(highestProfitSale.profit) : '—'}</span>
                <small>{highestProfitSale ? `${percent(highestProfitSale.margin)} margin` : ''}</small>
              </button>

              <button type="button" class="winner-card good" onclick={() => highestRoiSale && (selectedSale = highestRoiSale.sale)}>
                <span class="winner-label">Highest ROI</span>
                <strong>{highestRoiSale?.sale.title ?? 'No ROI yet'}</strong>
                <span class="winner-money">{highestRoiSale?.sale.roi == null ? '—' : percent(highestRoiSale.sale.roi)}</span>
                <small>{highestRoiSale ? `${money(highestRoiSale.profit)} profit` : 'Needs non-zero COGS'}</small>
              </button>

              <button type="button" class:bad={lowestProfitSale ? lowestProfitSale.profit < 0 : false} class="winner-card" onclick={() => lowestProfitSale && (selectedSale = lowestProfitSale.sale)}>
                <span class="winner-label">{lowestProfitSale && lowestProfitSale.profit < 0 ? 'Biggest loss' : 'Lowest profit'}</span>
                <strong>{lowestProfitSale?.sale.title ?? '—'}</strong>
                <span class="winner-money">{lowestProfitSale ? money(lowestProfitSale.profit) : '—'}</span>
                <small>{lowestProfitSale ? `${percent(lowestProfitSale.margin)} margin` : ''}</small>
              </button>

              <button type="button" class:bad={lowestMarginSale ? lowestMarginSale.margin < 0 : false} class="winner-card" onclick={() => lowestMarginSale && (selectedSale = lowestMarginSale.sale)}>
                <span class="winner-label">Lowest margin</span>
                <strong>{lowestMarginSale?.sale.title ?? '—'}</strong>
                <span class="winner-money">{lowestMarginSale ? percent(lowestMarginSale.margin) : '—'}</span>
                <small>{lowestMarginSale ? `${money(lowestMarginSale.profit)} profit` : ''}</small>
              </button>
            </div>
          {:else}
            <div class="empty-state">
              <strong>No fully costed sales to rank yet.</strong>
              Finish sale COGS and Sellquity will start calling out your winners and losers.
            </div>
          {/if}
        </section>

        <section class="panel inventory-health-report">
          <div class="panel-heading table-heading">
            <div>
              <span class="kicker">INVENTORY HEALTH</span>
              <h2>Capital and sell-through by category</h2>
            </div>
            <Boxes size={19} />
          </div>

          <div class="inventory-health-summary">
            <span><small>Tracked items</small><strong>{inventoryHealthSummary.tracked}</strong></span>
            <span><small>Tracked sell-through</small><strong>{percent(inventoryHealthSummary.sellThrough)}</strong></span>
            <span><small>Unlisted 30+ days</small><strong>{inventoryHealthSummary.unlistedOver30}</strong></span>
            <span><small>Active 61+ days</small><strong>{inventoryHealthSummary.activeOver60}</strong></span>
          </div>

          {#if inventoryHealthByCategory.length}
            <div class="table-wrap">
              <table class="inventory-health-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th class="num">Tracked</th>
                    <th class="num">Sold</th>
                    <th class="num">Sell-through</th>
                    <th class="num">Unsold</th>
                    <th class="num">Unsold COGS</th>
                    <th class="num">Active ask</th>
                    <th class="num">Avg age</th>
                    <th class="num">91+d</th>
                  </tr>
                </thead>
                <tbody>
                  {#each inventoryHealthByCategory as row}
                    <tr>
                      <td>
                        <span class="health-category">
                          <strong>{row.label}</strong>
                          <small>{row.unlisted} unlisted · {row.active} active</small>
                        </span>
                      </td>
                      <td class="num">{row.tracked}</td>
                      <td class="num">{row.sold}</td>
                      <td class="num">{percent(row.sellThrough)}</td>
                      <td class="num">{row.unsold}</td>
                      <td class="num">{money(row.unsoldCogs)}</td>
                      <td class="num">{money(row.activeAsking)}</td>
                      <td class="num">{row.averageActiveAge == null ? '—' : `${row.averageActiveAge}d`}</td>
                      <td class:age-stale={row.stale > 0} class="num">{row.stale}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {:else}
            <div class="empty-state">
              <strong>No inventory health data yet.</strong>
              Add or import inventory and Sellquity will start measuring where capital is sitting.
            </div>
          {/if}

          <div class="health-footnote">
            Sell-through here means sold inventory ÷ all tracked inventory in Sellquity. It is an operational inventory ratio, not an eBay marketplace-wide sell-through estimate.
          </div>
        </section>

        <section class="reports-grid">
          <article class="panel monthly-report">
            <div class="panel-heading table-heading">
              <div><span class="kicker">MONTHLY P&L</span><h2>Performance by month</h2></div>
              <button class="button mini secondary" onclick={exportPnl}><Download size={14} /> Export</button>
            </div>
            {#if monthlyRows.length}
              <div class="table-wrap"><table><thead><tr>
                <th>Month</th><th class="num">Sales</th><th class="num">Gross</th><th class="num">Marketplace fees</th>
                <th class="num">Labels</th><th class="num">Expenses</th><th class="num">COGS</th>
                <th class="num">Profit</th><th class="num">Margin</th>
              </tr></thead><tbody>
                {#each monthlyRows as row}
                  <tr>
                    <td><strong>{row.label}</strong>{#if row.missingCogs}<small class="report-warning">{row.missingCogs} COGS missing</small>{/if}</td>
                    <td class="num">{row.sales}</td>
                    <td class="num">{money(row.gross)}</td>
                    <td class="num negative">−{money(row.sellingFees)}</td>
                    <td class="num negative">−{money(row.shippingLabels)}</td>
                    <td class="num negative">{row.businessExpenses ? `−${money(row.businessExpenses)}` : money(0)}</td>
                    <td class="num negative">{row.cogs ? `−${money(row.cogs)}` : money(0)}</td>
                    <td class="num profit">{money(row.profit)}</td>
                    <td class="num">{percent(row.margin)}</td>
                  </tr>
                {/each}
              </tbody></table></div>
            {:else}
              <div class="empty-state"><strong>No report activity in this period.</strong>Choose a wider reporting range.</div>
            {/if}
          </article>

          <article class="panel expense-breakdown-panel">
            <div class="panel-heading">
              <div><span class="kicker">EXPENSE MIX</span><h2>Business expenses by category</h2></div>
              <ReceiptText size={19} />
            </div>
            {#if expenseBreakdown.length}
              <div class="expense-breakdown-list">
                {#each expenseBreakdown as row}
                  <div class="expense-breakdown-row">
                    <div class="expense-breakdown-copy">
                      <span>{row.label}</span>
                      <strong>{money(row.amountCents)}</strong>
                    </div>
                    <div class="report-bar"><span style:width={`${Math.max(5, row.amountCents / maxExpenseCategory * 100)}%`}></span></div>
                  </div>
                {/each}
              </div>
            {:else}
              <div class="empty-state compact-empty">
                {#if channelFilter === 'all'}
                  <strong>No business expenses in this period.</strong>Your manual expense categories will appear here.
                {:else}
                  <strong>Business-wide expenses are not assigned to {marketplaceLabel(channelFilter)}.</strong>
                  Switch to All channels to view and include them.
                {/if}
              </div>
            {/if}
          </article>
        </section>

        <section class="panel export-center">
          <div class="panel-heading table-heading">
            <div><span class="kicker">EXPORT CENTER</span><h2>Take your data with you</h2></div>
            <FileSpreadsheet size={20} />
          </div>
          <div class="export-grid">
            <button onclick={exportPnl}><span class="export-icon"><BarChart3 size={20} /></span><span><strong>Profit & loss</strong><small>Monthly revenue, fees, expenses, COGS and profit</small></span><Download size={17} /></button>
            <button onclick={exportSales}><span class="export-icon"><BadgeDollarSign size={20} /></span><span><strong>Sales report</strong><small>One row per sale with costs, profit, margin and ROI</small></span><Download size={17} /></button>
            <button disabled={channelFilter !== 'all'} onclick={exportExpenses}><span class="export-icon"><ReceiptText size={20} /></span><span><strong>Business-wide expense report</strong><small>{channelFilter === 'all' ? 'Manual business expenses and categories' : 'Switch to All channels to export'}</small></span><Download size={17} /></button>
            <button onclick={exportLedger}><span class="export-icon"><WalletCards size={20} /></span><span><strong>Transaction ledger</strong><small>Every normalized financial transaction in the period</small></span><Download size={17} /></button>
          </div>
        </section>

        <section class="print-report-only">
          <header>
            <strong>SELLQUITY</strong>
            <span>{channelLabel} · Business Performance Report</span>
          </header>
          <div class="print-summary">
            <div><span>Gross revenue</span><strong>{money(metrics.gross)}</strong></div>
            <div><span>Marketplace fees</span><strong>−{money(metrics.sellingFees)}</strong></div>
            <div><span>Shipping labels</span><strong>−{money(metrics.shippingLabels)}</strong></div>
            <div><span>Business expenses</span><strong>−{money(metrics.businessExpenses)}</strong></div>
            <div><span>Known COGS</span><strong>−{money(metrics.cogs)}</strong></div>
            <div><span>{profitLabel}</span><strong>{money(metrics.profit)}</strong></div>
          </div>
          <table>
            <thead><tr><th>Month</th><th>Sales</th><th>Gross</th><th>Fees</th><th>Labels</th><th>Expenses</th><th>COGS</th><th>Profit</th><th>Margin</th></tr></thead>
            <tbody>
              {#each monthlyRows as row}
                <tr><td>{row.label}</td><td>{row.sales}</td><td>{money(row.gross)}</td><td>{money(row.sellingFees)}</td><td>{money(row.shippingLabels)}</td><td>{money(row.businessExpenses)}</td><td>{money(row.cogs)}</td><td>{money(row.profit)}</td><td>{percent(row.margin)}</td></tr>
              {/each}
            </tbody>
          </table>
          {#if metrics.missingCogs}<p class="print-warning">{metrics.missingCogs} sale cost{metrics.missingCogs === 1 ? '' : 's'} missing. Profit is not final.</p>{/if}
        </section>
      </div>

    {:else}
      <section class="connection-layout">
        <article class="panel account-security-card">
          <div class="account-security-head">
            <span class="account-security-icon"><ShieldCheck size={21} /></span>
            <div>
              <span class="kicker">ACCOUNT & SECURITY</span>
              <h2>Signed in securely</h2>
            </div>
          </div>
          <div class="account-identity">
            <span class="account-avatar"><UserRound size={20} /></span>
            <div>
              <strong>{data.currentUser?.name ?? 'Sellquity user'}</strong>
              <small>{data.currentUser?.email ?? 'Authenticated session'}</small>
            </div>
            <span class="account-actions">
              <a class="button secondary" href="/account"><ShieldCheck size={16} /> Manage account</a>
              <button class="button secondary" type="button" onclick={signOutOfNettiva}><LogOut size={16} /> Sign out</button>
            </span>
          </div>
          <p>Authentication proves who you are. Workspace membership decides which seller data you can access.</p>
        </article>

        <article class="panel workspace-settings-card">
          <span class="kicker">WORKSPACE</span>
          <h2>Business identity</h2>
          <p>This is the tenant boundary Sellquity uses to keep inventory, accounting, marketplace data, and SKU sequences isolated from every other seller.</p>
          <form class="workspace-settings-form" onsubmit={saveWorkspace}>
            <label><span>Workspace name</span><input bind:value={workspaceName} maxlength="80" /></label>
            <div class="workspace-meta"><span><small>Plan</small><strong>{workspaceSafe.plan}</strong></span><span><small>Role</small><strong>{workspaceSafe.role}</strong></span><span><small>Workspace ID</small><strong>{workspaceSafe.id}</strong></span></div>
            {#if workspaceMessage}<p class="workspace-message">{workspaceMessage}</p>{/if}
            <button class="button primary" disabled={workspaceSaving || workspaceName.trim().length < 2}>{#if workspaceSaving}<LoaderCircle class="spin" size={16} />{:else}<Check size={16} />{/if} Save workspace</button>
          </form>
        </article>

        <article class="connection-card">
          <div class:connected={data.hasImportedData || data.connected} class="connection-hero"><FileSpreadsheet size={30} /><span>EBAY DATA</span></div>
          <h2>Seller Hub transaction import</h2>
          <p>Transaction reports are Sellquity's normal eBay accounting feed while direct API access is pending. Sales can close the same SKU you prepared and listed inside Sellquity.</p>
          <a class="button primary" href="/import"><FileSpreadsheet size={17} /> Import eBay transactions</a>
          <small>Duplicate-safe · sales · fees · shipping labels · payouts · inventory reconciliation</small>
        </article>

        <article class="panel setup-checklist">
          <span class="kicker">EBAY ACCOUNTING LOOP</span>
          <h2>Built for the workflow you can use today</h2>
          <ul>
            <li><Check /> Seller Hub Transaction reports</li>
            <li><Check /> Exact SKU / Custom label matching</li>
            <li><Check /> Sold inventory + listing closure</li>
            <li><Check /> COGS and true-profit workflow</li>
            <li><Check /> Payouts excluded from P&L</li>
          </ul>
          <div class="setup-note"><BarChart3 /><span><strong>API-ready underneath</strong>When eBay access arrives, automation can feed the same accounting model without replacing your inventory identities.</span></div>
        </article>

        <article class="panel advanced-card">
          <span class="kicker">AUTOMATION LATER</span>
          <h2>Marketplace connections</h2>
          <p>The provider-neutral architecture stays intact, but it no longer gets in the way of your personal eBay workflow. Whatnot and future API adapters remain parked underneath Sellquity.</p>
          <a class="button secondary" href="/marketplaces"><ExternalLink size={17} /> View marketplace hub</a>
        </article>
      </section>
    {/if}
  </main>
</div>

{#snippet inventoryTable(items: InventoryRow[], selectable: boolean)}
  <div class="table-wrap"><table class:selectable-table={selectable}><thead><tr>
    {#if selectable}
      <th class="select-col">
        <input
          class="inventory-check"
          type="checkbox"
          aria-label="Select all filtered inventory"
          checked={allFilteredSelected}
          onchange={toggleFilteredInventorySelection}
        />
      </th>
    {/if}
    <th>Item</th><th>Status</th><th>Location</th><th class="num">Purchase cost</th><th class="num">List price</th><th class="num">Age</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>
    {#each items as item}
      <tr class:selected-row={selectable && inventorySelected(item.id)}>
        {#if selectable}
          <td class="select-col">
            <input
              class="inventory-check"
              type="checkbox"
              aria-label={`Select ${item.title}`}
              checked={inventorySelected(item.id)}
              onchange={() => toggleInventorySelection(item.id)}
            />
          </td>
        {/if}
        <td><div class="item-title">
          {#if item.imageUrl}<img class="item-avatar" src={item.imageUrl} alt="" />{:else}<span class="item-avatar item-fallback">{initials(item.title)}</span>{/if}
          <span>
            <strong>{item.title}</strong>
            <small><span class="item-category">{inventoryCategoryLabel(item.category)}</span> · {item.sku || (item.ebayItemId ? `eBay ${item.ebayItemId}` : 'No SKU')}{item.purchasedAt ? ` · bought ${shortDate(item.purchasedAt)}` : ''}</small>
          </span>
        </div></td>
        <td><span class:status-active={item.status === 'active'} class:status-scheduled={item.status === 'scheduled'} class:status-sold={item.status === 'sold'} class:status-unlisted={item.status === 'unlisted'} class="status-pill">
          {#if item.status === 'active'}<Cloud size={13} />{:else if item.status === 'scheduled'}<Clock3 size={13} />{:else if item.status === 'sold'}<PackageCheck size={13} />{:else}<Archive size={13} />{/if}{item.status}
        </span></td>
        <td><span class="location"><MapPin size={14} />{item.location || 'Not set'}</span></td>
        <td class:missing={item.costCents == null} class="num">{money(item.costCents)}</td>
        <td class="num">{money(item.listPriceCents)}</td>
        <td class="num"><span class:age-stale={item.ageDays >= 90}>{item.status === 'active' || item.status === 'scheduled' ? `${item.ageDays}d` : '—'}</span></td>
        <td class="action-cell"><button class="button mini secondary" onclick={() => openEditor(item)}>Edit</button></td>
      </tr>
    {/each}
  </tbody></table></div>
{/snippet}

{#if bulkOpen}
  <div class="modal-backdrop" role="presentation">
    <button class="modal-dismiss" aria-label="Close bulk inventory editor" onclick={() => bulkOpen = false}></button>
    <div class="bulk-inventory-dialog" role="dialog" aria-modal="true" aria-labelledby="bulk-inventory-title">
      <button class="dialog-close" aria-label="Close" onclick={() => bulkOpen = false}><X size={18} /></button>
      <span class="kicker">BULK INVENTORY</span>
      <h2 id="bulk-inventory-title">Update {selectedInventoryIds.length} item{selectedInventoryIds.length === 1 ? '' : 's'}</h2>
      <p class="bulk-intro">
        Only the fields you check below will change. SKU, listing status, and sale identity are locked out of bulk edits.
      </p>

      <form class="bulk-inventory-form" onsubmit={saveBulkInventory}>
        <div class:enabled={bulkApplyLocation} class="bulk-field">
          <label class="bulk-field-head">
            <input type="checkbox" bind:checked={bulkApplyLocation} />
            <strong>Storage location</strong>
          </label>
          <input bind:value={bulkLocation} maxlength="80" disabled={!bulkApplyLocation} placeholder="Bin A-14 · blank clears location" />
        </div>

        <div class:enabled={bulkApplySource} class="bulk-field">
          <label class="bulk-field-head">
            <input type="checkbox" bind:checked={bulkApplySource} />
            <strong>Source</strong>
          </label>
          <input bind:value={bulkSource} maxlength="120" disabled={!bulkApplySource} placeholder="Card show, Goodwill, collection…" />
        </div>

        <div class:enabled={bulkApplyCategory} class="bulk-field">
          <label class="bulk-field-head">
            <input type="checkbox" bind:checked={bulkApplyCategory} />
            <strong>Category</strong>
          </label>
          <select bind:value={bulkCategory} disabled={!bulkApplyCategory}>
            {#each enabledInventoryCategories as category}
              <option value={category.value}>{category.label}</option>
            {/each}
          </select>
        </div>

        <div class:enabled={bulkApplyCondition} class="bulk-field">
          <label class="bulk-field-head">
            <input type="checkbox" bind:checked={bulkApplyCondition} />
            <strong>Condition</strong>
          </label>
          <input bind:value={bulkCondition} maxlength="80" disabled={!bulkApplyCondition} placeholder="Used, Near Mint… · blank clears" />
        </div>

        <div class:enabled={bulkApplyDate} class="bulk-field">
          <label class="bulk-field-head">
            <input type="checkbox" bind:checked={bulkApplyDate} />
            <strong>Purchase date</strong>
          </label>
          <input type="date" bind:value={bulkDate} disabled={!bulkApplyDate} />
        </div>

        <div class:enabled={bulkApplyCost} class="bulk-field">
          <label class="bulk-field-head">
            <input type="checkbox" bind:checked={bulkApplyCost} />
            <strong>Purchase cost <small>same value per item</small></strong>
          </label>
          <div class="money-input">
            <span>$</span>
            <input bind:value={bulkCost} inputmode="decimal" disabled={!bulkApplyCost} placeholder="Blank clears COGS" />
          </div>
        </div>

        <div class="bulk-safety wide-field">
          <ShieldCheck size={17} />
          <span>
            <strong>Safe fields only.</strong>
            This tool never bulk-edits SKU, eBay Item ID, listing status, or Sold status.
          </span>
        </div>

        {#if bulkMessage}<p class="form-message wide-field">{bulkMessage}</p>{/if}

        <div class="dialog-actions wide-field">
          <button class="button secondary" type="button" onclick={() => bulkOpen = false}>Cancel</button>
          <span class="dialog-spacer"></span>
          <button class="button primary" disabled={bulkSaving}>
            {#if bulkSaving}<LoaderCircle class="spin" size={16} />{:else}<Check size={16} />{/if}
            Apply to {selectedInventoryIds.length}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

{#if skuManagerOpen}
  <div class="modal-backdrop" role="presentation">
    <button class="modal-dismiss" aria-label="Close SKU manager" onclick={() => skuManagerOpen = false}></button>
    <div class="sku-manager-dialog" role="dialog" aria-modal="true" aria-labelledby="sku-manager-title">
      <button class="dialog-close" aria-label="Close" onclick={() => skuManagerOpen = false}><X size={18} /></button>
      <span class="kicker">SKU CONTROL CENTER</span>
      <h2 id="sku-manager-title">Never reuse an inventory identity</h2>
      <p class="sku-manager-intro">Bootstrap the labels already living on eBay now. Once API sync is connected, Sellquity will automatically claim SKUs from both active and scheduled listings.</p>
      <div class="sku-sequence-grid">{#each skuPrefixSummary as row}<div><span>{row.label}</span><strong>{row.nextSku}</strong><small>{row.lastNumber ? `through ${row.prefix}-${String(row.lastNumber).padStart(4, '0')} already used` : 'no numbers used yet'}</small></div>{/each}</div>
      <form class="sku-bootstrap-form" onsubmit={reserveSkus}>
        <label><span>Paste existing eBay custom labels</span><textarea bind:value={skuPaste} rows="5" placeholder={"Paste the SKU column—or even messy copied Seller Hub text.\n\nAFG-0001\nAFG-0014\nMOV-0003\nELC-0002"}></textarea></label>
        <div class="sku-bootstrap-bottom"><p><strong>Numbers only move forward.</strong> Removing a reservation never makes that sequence number available again.</p><button class="button primary" disabled={reservingSkus || !skuPaste.trim()}>{#if reservingSkus}<LoaderCircle class="spin" size={16} />{:else}<Check size={16} />{/if} Reserve detected SKUs</button></div>
      </form>
      {#if skuReserveMessage}<p class="sku-reserve-message">{skuReserveMessage}</p>{/if}
      <div class="sku-reservation-section">
        <div class="sku-reservation-heading"><div><strong>Manual bootstrap reservations</strong><small>{manualReservations.length} reservation{manualReservations.length === 1 ? '' : 's'}</small></div><span>{skuReservationsSafe.filter((row) => row.status === 'claimed').length} claimed by eBay</span></div>
        {#if manualReservations.length}<div class="sku-reservation-list">{#each manualReservations as reservation}<div class="sku-reservation-row"><strong>{reservation.sku}</strong><span>{reservation.status === 'claimed' ? 'Claimed' : 'Reserved'}</span><small>{reservation.title ?? 'Imported from your existing SKU list'}</small>{#if reservation.status === 'reserved' && !reservation.ebayItemId && !reservation.inventoryItemId}<button type="button" class="button mini secondary" disabled={deletingReservationId === reservation.id} onclick={() => deleteSkuReservation(reservation.id, reservation.sku)}>{#if deletingReservationId === reservation.id}<LoaderCircle class="spin" size={13} />{:else}<X size={13} />{/if} Remove</button>{:else}<span class="sku-claimed-lock">Locked</span>{/if}</div>{/each}</div>{:else}<div class="empty-state compact-empty"><strong>No bootstrap reservations yet.</strong>Paste your current Seller Hub custom labels above. Sellquity will ignore labels it already knows from inventory.</div>{/if}
      </div>
    </div>
  </div>
{/if}

{#if intakeOpen}
  <div class="modal-backdrop" role="presentation">
    <button class="modal-dismiss" aria-label="Close inventory intake" onclick={() => intakeOpen = false}></button>
    <div class="intake-dialog" role="dialog" aria-modal="true" aria-labelledby="intake-title">
      <button class="dialog-close" aria-label="Close" onclick={() => intakeOpen = false}><X size={18} /></button>
      <span class="kicker">INVENTORY INTAKE</span>
      <h2 id="intake-title">Add something you bought</h2>
      <p class="intake-intro">Capture the cost now. When this item later appears on a marketplace with the same unique SKU/custom label, Sellquity can reconcile the listing onto this record instead of creating a duplicate.</p>

      <form class="intake-form" onsubmit={saveIntake}>
        <label class="wide-field">
          <span>Item title</span>
          <input bind:value={intakeTitle} maxlength="240" placeholder="1991 WWF Undertaker…" required />
        </label>

        <label>
          <span>Category</span>
          <select
            value={intakeCategory}
            onchange={(event) => selectIntakeCategory(event.currentTarget.value as InventoryCategory)}
          >
            {#each enabledInventoryCategories as category}
              <option value={category.value}>{category.label}</option>
            {/each}
          </select>
        </label>

        <label>
          <span>Quantity</span>
          <input bind:value={intakeQuantity} type="number" min="1" max="50" step="1" />
        </label>

        <label>
          <span>Purchase cost <small>{intakeCostMode === 'each' ? 'each' : 'lot total'}</small></span>
          <div class="money-input"><span>$</span><input bind:value={intakeCost} inputmode="decimal" placeholder="0.00" required /></div>
        </label>

        {#if Number(intakeQuantity) > 1}
          <div class="cost-mode-card wide-field">
            <div class="cost-mode-copy">
              <strong>How should this cost be applied?</strong>
              <small>{intakeCostSummary}</small>
            </div>
            <div class="cost-mode-toggle" role="group" aria-label="Choose batch cost mode">
              <button type="button" class:active={intakeCostMode === 'each'} onclick={() => intakeCostMode = 'each'}>Per item</button>
              <button type="button" class:active={intakeCostMode === 'total'} onclick={() => intakeCostMode = 'total'}>Total lot cost</button>
            </div>
          </div>
        {/if}

        <label>
          <span>Purchase date</span>
          <input type="date" bind:value={intakeDate} />
        </label>

        <div class="sku-builder wide-field">
          <div class="sku-builder-head">
            <div>
              <strong>SKU / marketplace label</strong>
              <small>Stable identity for future marketplace matching</small>
            </div>
            <label class="sku-auto-toggle">
              <input type="checkbox" bind:checked={intakeAutoSku} />
              <span>Auto-generate</span>
            </label>
          </div>

          {#if intakeAutoSku}
            <div class="sku-auto-grid">
              <label>
                <span>Prefix</span>
                <input
                  value={intakePrefix}
                  maxlength="8"
                  oninput={(event) => intakePrefix = normalizedPrefix(event.currentTarget.value)}
                />
              </label>
              <div class="sku-preview">
                <span>Next SKU{Number(intakeQuantity) > 1 ? ' range' : ''}</span>
                <strong>{intakeSkuPreview}</strong>
                <small>Server verifies the next available number when saved.</small>
              </div>
            </div>
          {:else}
            <label>
              <span>Custom SKU</span>
              <input bind:value={intakeSku} maxlength="100" placeholder="AFG-0001" />
            </label>
          {/if}
        </div>

        <label>
          <span>Condition</span>
          <input bind:value={intakeCondition} maxlength="80" placeholder="New, Used, Near Mint…" />
        </label>

        <label>
          <span>Storage location</span>
          <input bind:value={intakeLocation} maxlength="80" placeholder="A-14" />
        </label>

        <label class="wide-field">
          <span>Source</span>
          <input bind:value={intakeSource} maxlength="120" placeholder="Card show, flea market, eBay lot, Goodwill…" />
        </label>

        {#if Number(intakeQuantity) > 1}
          <div class="batch-note wide-field">
            <Boxes size={17} />
            <span>
              <strong>Batch intake</strong>
              Sellquity will create {intakeQuantity} separate inventory records with individual SKUs.
              {intakeCostMode === 'total'
                ? ` The exact ${money(Math.round((Number(intakeCost) || 0) * 100))} lot cost will be distributed across them without losing a cent.`
                : ` Each item will carry ${money(Math.round((Number(intakeCost) || 0) * 100))} of COGS.`}
            </span>
          </div>
        {/if}

        <div class="intake-match-note wide-field">
          <Tag size={17} />
          <span><strong>Future marketplace match</strong>Use the generated SKU as the marketplace SKU/custom label. The listing title can be completely different.</span>
        </div>

        {#if intakeMessage}<p class="form-message wide-field">{intakeMessage}</p>{/if}

        <div class="dialog-actions intake-actions wide-field">
          <button type="button" class="button secondary" onclick={() => intakeOpen = false}>Cancel</button>
          <span class="dialog-spacer"></span>
          <button
            class="button secondary"
            data-action="add-another"
            disabled={intakeSaving || !intakeTitle.trim() || !Number.isFinite(Number(intakeCost)) || Number(intakeCost) < 0}
          >
            {#if intakeSaving}<LoaderCircle class="spin" size={17} />{:else}<Check size={17} />{/if}
            Save + next
          </button>
          <button
            class="button primary"
            data-action="close"
            disabled={intakeSaving || !intakeTitle.trim() || !Number.isFinite(Number(intakeCost)) || Number(intakeCost) < 0}
          >
            {#if intakeSaving}<LoaderCircle class="spin" size={17} />{:else}<Check size={17} />{/if}
            Add inventory
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

{#if editing}
  <div class="modal-backdrop" role="presentation">
    <button class="modal-dismiss" aria-label="Close inventory editor" onclick={() => editing = null}></button>
    <div class="edit-dialog" role="dialog" aria-modal="true" aria-labelledby="edit-title">
      <button class="dialog-close" aria-label="Close" onclick={() => editing = null}><X size={18} /></button>
      <span class="kicker">INVENTORY DETAILS</span><h2 id="edit-title">{editing.title}</h2>
      <form class="inventory-edit-form" onsubmit={saveItem}>
        <label class="wide-field"><span>Title</span><input bind:value={editTitle} maxlength="240" /></label>
        <label>
          <span>Category</span>
          <select bind:value={editCategory}>
            {#each enabledInventoryCategories as category}
              <option value={category.value}>{category.label}</option>
            {/each}
          </select>
        </label>
        <label><span>SKU / custom label</span><input bind:value={editSku} maxlength="100" placeholder="Optional but recommended" /></label>
        <label><span>Condition</span><input bind:value={editCondition} maxlength="80" placeholder="Near Mint, Used…" /></label>
        <label><span>Purchase date</span><input type="date" bind:value={editDate} /></label>
        <label><span>Purchase cost</span><div class="money-input"><span>$</span><input bind:value={cost} inputmode="decimal" placeholder="0.00" /></div></label>
        <label><span>Source</span><input bind:value={source} placeholder="Card show, Goodwill…" /></label>
        <label><span>Storage location</span><input bind:value={location} placeholder="A-14" /></label>

        {#if !editing.ebayItemId && editing.status === 'unlisted'}
          <p class="sku-helper wide-field">Use the same SKU/custom label when you list this on a marketplace. Sellquity will use a unique match to attach the future listing without losing your cost or intake history.</p>
        {/if}
        {#if saveMessage}<p class="form-message wide-field">{saveMessage}</p>{/if}

        <div class="dialog-actions wide-field">
          {#if editing.id.startsWith('manual:') && !editing.ebayItemId && editing.status === 'unlisted'}
            <button type="button" class="button danger-button" disabled={deletingInventory} onclick={deleteInventoryItem}>
              {#if deletingInventory}<LoaderCircle class="spin" size={16} />{:else}<X size={16} />{/if}
              Delete
            </button>
          {/if}
          <span class="dialog-spacer"></span>
          <button type="button" class="button secondary" onclick={() => editing = null}>Cancel</button>
          <button class="button primary" disabled={saving || !editTitle.trim() || (cost !== '' && !Number.isFinite(Number(cost)))}>
            {#if saving}<LoaderCircle class="spin" size={17} />{:else}<Check size={17} />{/if} Save details
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

{#if selectedSale}
  {@const grossRevenue = selectedSale.salePriceCents + selectedSale.shippingChargedCents}
  {@const afterMarketplaceFees = grossRevenue - selectedSale.sellingFeesCents}
  {@const refundDisputeTotal = selectedSale.refundsCents + selectedSale.disputesCents}

  <div class="modal-backdrop" role="presentation">
    <button class="modal-dismiss" aria-label="Close sale breakdown" onclick={() => selectedSale = null}></button>
    <div class="sale-dialog" role="dialog" aria-modal="true" aria-labelledby="sale-title">
      <button class="dialog-close" aria-label="Close" onclick={() => selectedSale = null}><X size={18} /></button>
      <span class="kicker">SALE BREAKDOWN</span>
      <h2 id="sale-title">{selectedSale.title}</h2>
      <p class="sale-dialog-sub">
        <span class:whatnot={saleProvider(selectedSale) === 'whatnot'} class="marketplace-pill">
          {marketplaceLabel(saleProvider(selectedSale))}
        </span>
        Order {selectedSale.ebayOrderId} · sold {shortDate(selectedSale.soldAt)}
      </p>

      <div class="money-flow">
        <section class="money-flow-section">
          <div class="money-flow-heading"><span>01</span><strong>Gross revenue</strong></div>
          <div class="money-line"><span>Item price</span><strong>{money(selectedSale.salePriceCents)}</strong></div>
          <div class="money-line"><span>Buyer-paid shipping</span><strong>{money(selectedSale.shippingChargedCents)}</strong></div>
          <div class="money-line subtotal"><span>Gross collected</span><strong>{money(grossRevenue)}</strong></div>
        </section>

        <section class="money-flow-section">
          <div class="money-flow-heading"><span>02</span><strong>{marketplaceLabel(saleProvider(selectedSale))}</strong></div>
          <div class="money-line expense"><span>Selling fees</span><strong>−{money(selectedSale.sellingFeesCents)}</strong></div>
          <div class="money-line subtotal ebay-net"><span>After marketplace fees</span><strong>{money(afterMarketplaceFees)}</strong></div>
          <p class="flow-note">Gross collected less marketplace selling fees. Shipping labels and other costs are shown separately.</p>
        </section>

        <section class="money-flow-section">
          <div class="money-flow-heading"><span>03</span><strong>Your costs</strong></div>
          <div class="money-line expense"><span>Shipping label</span><strong>{selectedSale.shippingLabelCents ? `−${money(selectedSale.shippingLabelCents)}` : money(0)}</strong></div>
          <div class="money-line expense"><span>Refunds / disputes</span><strong>{refundDisputeTotal ? `−${money(refundDisputeTotal)}` : money(0)}</strong></div>
          <div class="money-line expense"><span>COGS</span><strong class:missing-value={selectedSale.cogsCents == null}>{selectedSale.cogsCents == null ? 'Missing' : `−${money(selectedSale.cogsCents)}`}</strong></div>
          {#if selectedSale.otherAdjustmentsCents !== 0}
            <div class="money-line"><span>Other adjustments</span><strong class:credit={selectedSale.otherAdjustmentsCents > 0} class:debit={selectedSale.otherAdjustmentsCents < 0}>{formatSigned(selectedSale.otherAdjustmentsCents)}</strong></div>
          {/if}
        </section>

        <section class="money-flow-result">
          <div>
            <span>{selectedSale.cogsCents == null ? 'PROFIT BEFORE COGS' : 'NET PROFIT'}</span>
            <strong>{money(selectedSale.netProfitCents)}</strong>
          </div>
          <div class="result-stat">
            <span>Margin</span>
            <strong>{percent(selectedSale.margin)}</strong>
          </div>
          <div class="result-stat">
            <span>ROI</span>
            <strong>{selectedSale.roi == null ? '—' : percent(selectedSale.roi)}</strong>
          </div>
        </section>
      </div>

      {#if selectedSale.cogsCents == null}
        <div class="sale-detail-section sale-cogs-editor">
          <span><strong>Finish this sale:</strong> enter what you paid for the item.</span>
          <label class="cogs-input">
            <span>$</span>
            <input
              aria-label={`Purchase cost for ${selectedSale.title}`}
              inputmode="decimal"
              placeholder="0.00"
              value={costDrafts[selectedSale.id] ?? ''}
              oninput={(event) => costDrafts[selectedSale!.id] = event.currentTarget.value}
            />
          </label>
          <button class="button primary" disabled={savingCostId === selectedSale.id} onclick={() => saveSaleCost(selectedSale!)}>
            {#if savingCostId === selectedSale.id}<LoaderCircle class="spin" size={15} />{:else}<Check size={15} />{/if}
            Save cost
          </button>
        </div>
      {/if}

      <details class="transaction-details">
        <summary>
          <span><ReceiptText size={16} /> Marketplace ledger details</span>
          <small>{relatedTransactions.length} transaction{relatedTransactions.length === 1 ? '' : 's'}</small>
        </summary>
        {#if relatedTransactions.length}
          <div class="sale-transaction-list">
            {#each relatedTransactions as transaction}
              <div class="sale-transaction">
                <span class={`ledger-category ${transaction.category}`}>{categoryLabel(transaction.category)}</span>
                <span>
                  {transactionDisplayLabel(transaction)}
                  {#if transaction.category === 'sale'}
                    <small>Marketplace-reported net proceeds</small>
                  {/if}
                </span>
                <strong class:credit={transaction.amountCents > 0} class:debit={transaction.amountCents < 0}>{formatSigned(transaction.amountCents)}</strong>
              </div>
            {/each}
          </div>
        {:else}
          <div class="accounting-note"><Info size={16} />No detailed finance rows are attached to this sale yet.</div>
        {/if}
      </details>
    </div>
  </div>
{/if}
