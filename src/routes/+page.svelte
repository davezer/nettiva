<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import {
    AlertTriangle, Archive, ArrowUpRight, BadgeDollarSign, BarChart3, Boxes,
    CalendarDays, Calculator, Check, ChevronRight, CircleDollarSign, Clock3,
    Cloud, Download, ExternalLink, FileSpreadsheet, Info, LayoutDashboard, LoaderCircle,
    MapPin, PackageCheck, PlugZap, Printer, ReceiptText, RefreshCw, Search, Settings,
    ShoppingBag, Tag, TrendingUp, WalletCards, X
  } from '@lucide/svelte';
  import type {
    AccountingTransactionRow,
    DashboardData,
    ExpenseCategory,
    FinanceCategory,
    InventoryCategory,
    InventoryRow,
    SaleRow
  } from '$lib/types';
  import { money, shortDate } from '$lib/money';

  let { data }: { data: DashboardData } = $props();

  type View = 'dashboard' | 'inventory' | 'sales' | 'accounting' | 'reports' | 'settings';
  type Filter = 'all' | InventoryRow['status'];
  type InventoryCategoryFilter = 'all' | InventoryCategory;
  type DatePreset = 'all' | '30d' | 'this-month' | 'last-month' | 'ytd' | 'custom';

  const PNL_CATEGORIES = new Set<FinanceCategory>([
    'selling_fee', 'shipping_label', 'refund', 'dispute',
    'other_fee', 'adjustment', 'withheld_tax', 'purchase', 'business_expense'
  ]);

  let view = $state<View>('dashboard');
  let query = $state('');
  let filter = $state<Filter>('all');
  let inventoryCategoryFilter = $state<InventoryCategoryFilter>('all');
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
  let customStart = $state('');
  let customEnd = $state('');

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

  const inventoryCategories: { value: InventoryCategory; label: string; prefix: string }[] = [
    { value: 'action_figures', label: 'Action Figures', prefix: 'AFG' },
    { value: 'baseball_cards', label: 'Baseball Cards', prefix: 'BSC' },
    { value: 'electronics', label: 'Electronics', prefix: 'ELC' },
    { value: 'movies', label: 'Movies / Blu-ray', prefix: 'MOV' },
    { value: 'video_games', label: 'Video Games', prefix: 'VGM' },
    { value: 'trading_cards', label: 'Trading Cards', prefix: 'TCG' },
    { value: 'collectibles', label: 'Collectibles', prefix: 'COL' },
    { value: 'other', label: 'Other', prefix: 'OTH' }
  ];

  const navItems = [
    { view: 'dashboard' as const, label: 'Overview', icon: LayoutDashboard },
    { view: 'inventory' as const, label: 'Inventory', icon: Boxes },
    { view: 'sales' as const, label: 'Sales', icon: BadgeDollarSign },
    { view: 'accounting' as const, label: 'Accounting', icon: Calculator },
    { view: 'reports' as const, label: 'Reports', icon: BarChart3 },
    { view: 'settings' as const, label: 'Data & eBay', icon: Settings }
  ];

  function inventoryCategoryLabel(category: InventoryCategory) {
    return inventoryCategories.find((option) => option.value === category)?.label ?? 'Other';
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

  const filteredSales = $derived.by(() => data.sales.filter((sale) => inDateRange(sale.soldAt)));
  const filteredTransactions = $derived.by(() =>
    data.transactions.filter((transaction) => inDateRange(transaction.transactionDate))
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

  const skuSequencesSafe = $derived(data.skuSequences ?? []);
  const skuReservationsSafe = $derived(data.skuReservations ?? []);

  const skuPrefixSummary = $derived.by(() =>
    inventoryCategories.map((category) => ({
      ...category,
      nextSku: formatInventorySku(category.prefix, clientSkuSequence(category.prefix)),
      lastNumber: clientSkuSequence(category.prefix) - 1
    }))
  );

  const manualReservations = $derived(
    skuReservationsSafe.filter((reservation) => reservation.source === 'manual_bootstrap')
  );

  const filteredInventory = $derived(data.inventory.filter((item) => {
    const matchesStatus = filter === 'all' || item.status === filter;
    const matchesCategory = inventoryCategoryFilter === 'all' || item.category === inventoryCategoryFilter;
    const haystack = `${item.title} ${item.sku ?? ''} ${item.ebayItemId ?? ''} ${inventoryCategoryLabel(item.category)}`.toLowerCase();
    return matchesStatus && matchesCategory && haystack.includes(query.toLowerCase());
  }));

  const relatedTransactions = $derived.by(() => {
    if (!selectedSale) return [];
    return data.transactions.filter((transaction) =>
      transaction.ebayLineItemId === selectedSale?.ebayLineItemId ||
      transaction.ebayOrderId === selectedSale?.ebayOrderId
    );
  });

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
        ? 'Profit before missing COGS'
        : 'Net profit'
  );

  const percent = (value: number) => `${value.toFixed(1)}%`;
  const initials = (title: string) =>
    title.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join('').toUpperCase();

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
    const startingCategory = inventoryCategoryFilter === 'all' ? 'action_figures' : inventoryCategoryFilter;
    intakeCategory = startingCategory;
    intakePrefix = inventoryCategoryPrefix(startingCategory);
    intakeQuantity = '1';
    intakeCost = '';
    intakeSource = '';
    intakeLocation = '';
    intakeCondition = '';
    intakeDate = new Date().toISOString().slice(0, 10);
    intakeMessage = null;
    intakeOpen = true;
  }

  function openCogsQueue() {
    view = 'accounting';
    costMessage = null;
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
    if (!confirm(`Delete "${editing.title}" from Nettiva inventory?`)) return;

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
    if (!start && !end) return 'all-time';
    const format = (date: Date | null) => date ? date.toISOString().slice(0, 10) : 'open';
    return `${format(start)}_to_${format(end)}`;
  }

  function exportPnl() {
    downloadCsv(
      `nettiva-pnl-${reportSuffix()}.csv`,
      ['Month', 'Sales', 'Gross revenue', 'eBay fees', 'Shipping labels', 'Refunds/disputes', 'Other adjustments', 'Business expenses', 'COGS', 'Missing COGS', 'Net profit', 'Margin %'],
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
      `nettiva-sales-${reportSuffix()}.csv`,
      ['Sold date', 'Order ID', 'eBay item ID', 'Title', 'Item price', 'Buyer shipping', 'Selling fees', 'Shipping label', 'Refunds', 'Disputes', 'Other adjustments', 'COGS', 'Profit', 'Margin %', 'ROI %'],
      filteredSales.map((sale) => [
        sale.soldAt,
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
      `nettiva-expenses-${reportSuffix()}.csv`,
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
      `nettiva-ledger-${reportSuffix()}.csv`,
      ['Date', 'Category', 'Type', 'Description', 'Order ID', 'Fee type', 'Amount', 'Source', 'Expense category', 'Memo', 'Payout ID', 'Reference ID'],
      filteredTransactions.map((transaction) => [
        transaction.transactionDate,
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

<div class="app-shell">
  <aside class="sidebar">
    <div class="brand">
      <span class="brand-mark">N</span>
      <div><strong>NETTIVA</strong><small>Resale intelligence</small></div>
    </div>

    <nav aria-label="Primary navigation">
      {#each navItems as item}
        {@const Icon = item.icon}
        <button class:active={view === item.view} onclick={() => view = item.view}>
          <Icon size={19} />
          <span>{item.label}</span>
          {#if view === item.view}<ChevronRight class="nav-arrow" size={15} />{/if}
        </button>
      {/each}
    </nav>

    <div class="sidebar-foot">
      <div class:online={data.connected} class="connection-dot"></div>
      <div>
        <strong>{data.connected ? 'eBay connected' : data.hasImportedData ? 'Accounting workspace' : 'Demo workspace'}</strong>
        <small>{data.lastSyncedAt ? `Synced ${shortDate(data.lastSyncedAt)}` : data.hasImportedData ? 'Manual history loaded' : 'Read-only mode'}</small>
      </div>
    </div>
  </aside>

  <main class="main-panel">
    <header class="topbar">
      <div>
        <span class="eyebrow">{view === 'settings' ? 'SETUP' : view === 'accounting' ? 'MONEY DESK' : view === 'reports' ? 'REPORTING DESK' : 'SELLER COMMAND CENTER'}</span>
        <h1>{navItems.find((item) => item.view === view)?.label}</h1>
      </div>
      <div class="top-actions">
        {#if data.isDemo}
          <span class="demo-badge">Demo data</span>
        {:else if !data.financialsComplete}
          <span class="demo-badge">Fees pending</span>
        {:else if metrics.missingCogs > 0 && ['dashboard', 'sales', 'accounting', 'reports'].includes(view)}
          <span class="demo-badge">{metrics.missingCogs} COGS missing</span>
        {/if}
        {#if data.connected}
          <button class="button secondary" onclick={syncNow} disabled={syncing}>
            {#if syncing}<LoaderCircle class="spin" size={17} />{:else}<RefreshCw size={17} />{/if}
            Sync now
          </button>
        {:else}
          <a class="button primary" href="/api/ebay/connect"><PlugZap size={17} /> Connect eBay</a>
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
      </div>
    {/if}

    {#if view === 'dashboard'}
      <div class="view-stack">
        <section class="metrics-grid" aria-label="Business summary">
          <article class="metric-card tone-green">
            <div class="metric-top"><span>Gross sales</span><CircleDollarSign size={18} /></div>
            <strong>{money(metrics.gross)}</strong>
            <p>{filteredSales.length} sales in period</p>
          </article>
          <article class="metric-card tone-blue">
            <div class="metric-top"><span>{profitLabel}</span><TrendingUp size={18} /></div>
            <strong>{money(metrics.profit)}</strong>
            <p>{profitIsFinal ? `${percent(metrics.margin)} true margin` : metrics.missingCogs ? `${metrics.missingCogs} sale cost${metrics.missingCogs === 1 ? '' : 's'} still needed` : 'Financial data still reconciling'}</p>
          </article>
          <article class="metric-card tone-violet">
            <div class="metric-top"><span>Active inventory</span><ShoppingBag size={18} /></div>
            <strong>{activeItems.length}</strong>
            <p>{money(activeValue)} listed</p>
          </article>
          <article class="metric-card tone-amber">
            <div class="metric-top"><span>Average age</span><Clock3 size={18} /></div>
            <strong>{avgAge} days</strong>
            <p>{stale ? `${stale} stale listing${stale === 1 ? '' : 's'}` : activeItems.length ? 'Inventory is moving' : 'Waiting for live listing sync'}</p>
          </article>
        </section>

        <section class="dashboard-grid">
          <article class="panel profit-panel">
            <div class="panel-heading">
              <div><span class="kicker">PERIOD PERFORMANCE</span><h2>Profit by sale</h2></div>
              <button onclick={() => view = 'sales'}>View all <ChevronRight size={16} /></button>
            </div>
            {#if filteredSales.length}
              <div class="profit-bars">
                {#each filteredSales.slice(0, 5) as sale}
                  <div class="profit-row">
                    <span>{shortDate(sale.soldAt)}</span>
                    <div class="bar-track"><span style:width={`${Math.max(8, sale.netProfitCents / maxProfit * 100)}%`}></span></div>
                    <strong>{money(sale.netProfitCents)}</strong>
                  </div>
                {/each}
              </div>
              <div class="margin-footer">
                <ArrowUpRight size={17} />
                <span><strong>{percent(metrics.margin)}</strong> {profitIsFinal ? 'true margin after fees and COGS' : 'current margin before missing costs are entered'}</span>
              </div>
            {:else}
              <div class="empty-state"><strong>No sales in this period.</strong>Try a wider reporting range.</div>
            {/if}
          </article>

          <article class="panel attention-panel">
            <div class="panel-heading"><div><span class="kicker">QUEUE</span><h2>Needs attention</h2></div><AlertTriangle size={20} /></div>
            <button onclick={openCogsQueue}>
              <span class="attention-icon amber"><Tag size={17} /></span>
              <span><strong>{metrics.missingCogs} missing sale cost{metrics.missingCogs === 1 ? '' : 's'}</strong><small>{metrics.missingCogs ? 'Finish COGS to unlock true profit' : 'Sale costs are complete'}</small></span>
              <ChevronRight size={17} />
            </button>
            <button onclick={() => { filter = 'active'; view = 'inventory'; }}>
              <span class="attention-icon red"><Clock3 size={17} /></span>
              <span><strong>{stale} listing{stale === 1 ? '' : 's'} over 90 days</strong><small>Review price or end listing</small></span>
              <ChevronRight size={17} />
            </button>
            <button onclick={() => view = 'accounting'}>
              <span class="attention-icon blue"><ReceiptText size={17} /></span>
              <span><strong>Review the money trail</strong><small>Fees, labels, adjustments and payouts</small></span>
              <ChevronRight size={17} />
            </button>
          </article>
        </section>

        <section class="panel recent-inventory">
          <div class="panel-heading table-heading">
            <div><span class="kicker">LIVE INVENTORY</span><h2>Items to watch</h2></div>
            <button onclick={() => view = 'inventory'}>Open inventory <ChevronRight size={16} /></button>
          </div>
          {#if activeItems.length}
            {@render inventoryTable(activeItems.slice(0, 5))}
          {:else}
            <div class="empty-state">
              <strong>Live inventory will appear after eBay API sync.</strong>
              Your accounting workspace can still run from transaction history while API approval is pending.
            </div>
          {/if}
        </section>
      </div>

    {:else if view === 'inventory'}
      <div class="inventory-view-stack">
        <section class="inventory-summary sku-aware-summary">
          <div><span>Unlisted intake</span><strong>{unlistedCount}</strong><small>waiting to list</small></div>
          <div><span>Scheduled</span><strong>{scheduledItems.length}</strong><small>future eBay listings</small></div>
          <div><span>Active listings</span><strong>{activeItems.length}</strong><small>{money(activeValue)} listed</small></div>
          <div><span>Inventory cost basis</span><strong>{money(inventoryCostBasis)}</strong><small>unsold purchase cost</small></div>
          <div class="inventory-summary-actions"><button class="button secondary" onclick={() => skuManagerOpen = true}><Archive size={17} /> SKU manager</button><button class="button primary" onclick={openIntake}><Tag size={17} /> Add inventory</button></div>
        </section>

        <section class="panel inventory-panel">
          <div class="inventory-tools">
            <label class="search-field"><Search size={18} /><span class="sr-only">Search inventory</span><input bind:value={query} placeholder="Search title, SKU, category, or eBay ID" /></label>
            <label class="inventory-category-filter">
              <span class="sr-only">Filter by category</span>
              <select bind:value={inventoryCategoryFilter}>
                <option value="all">All categories</option>
                {#each inventoryCategories as category}
                  <option value={category.value}>{category.label}</option>
                {/each}
              </select>
            </label>
            <div class="filter-tabs" role="group" aria-label="Filter inventory">
              {#each ['all', 'active', 'scheduled', 'unlisted', 'sold'] as value}
                <button class:active={filter === value} onclick={() => filter = value as Filter}>{value}</button>
              {/each}
            </div>
          </div>
        {#if filteredInventory.length}
          {@render inventoryTable(filteredInventory)}
        {:else}
          <div class="empty-state"><strong>No inventory matches this view.</strong>Live listings will populate automatically once the eBay API is connected.</div>
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
            <th>Item</th><th>Sold</th><th class="num">Gross</th><th class="num">eBay + ship</th>
            <th class="num">COGS</th><th class="num">Profit</th><th class="num">Margin</th><th class="num">ROI</th>
          </tr></thead><tbody>
            {#each filteredSales as sale}
              <tr>
                <td>
                  <button class="sale-button" onclick={() => selectedSale = sale}>
                    <strong>{sale.title}</strong>
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
          <article class="metric-card tone-blue"><div class="metric-top"><span>eBay selling fees</span><ReceiptText size={18} /></div><strong>{money(metrics.sellingFees)}</strong><p>Platform fees in period</p></article>
          <article class="metric-card tone-violet"><div class="metric-top"><span>Shipping labels</span><PackageCheck size={18} /></div><strong>{money(metrics.shippingLabels)}</strong><p>Seller-paid postage</p></article>
          <article class="metric-card tone-amber"><div class="metric-top"><span>{profitLabel}</span><WalletCards size={18} /></div><strong>{money(metrics.profit)}</strong><p>{profitIsFinal ? `${percent(metrics.margin)} true margin` : `${metrics.missingCogs} missing COGS`}</p></article>
        </section>

        <section class="accounting-grid">
          <article class="panel accounting-summary">
            <div class="panel-heading"><div><span class="kicker">PROFIT & LOSS</span><h2>Where the money went</h2></div><BarChart3 size={20} /></div>
            <div class="pnl-list">
              <div class="pnl-row"><span>Gross sales + buyer shipping</span><strong class="credit">+{money(metrics.gross)}</strong></div>
              <div class="pnl-row"><span>eBay selling fees</span><strong class="debit">−{money(metrics.sellingFees)}</strong></div>
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
                <span>{!data.financialsComplete ? 'Financial transactions are not fully loaded yet.' : `${metrics.missingCogs} sale${metrics.missingCogs === 1 ? '' : 's'} still need purchase cost. Nettiva is intentionally not calling this true net profit yet.`}</span>
              </div>
            {/if}
          </article>

          <article class="panel cogs-panel">
            <div class="panel-heading"><div><span class="kicker">COGS DESK</span><h2>Missing purchase costs</h2></div><Tag size={20} /></div>
            {#if missingSaleCosts.length}
              <div class="cogs-list">
                {#each missingSaleCosts as sale}
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
              {#if costMessage}<p class="queue-note">{costMessage}</p>{/if}
            {:else}
              <div class="cogs-complete"><Check size={18} /> Every sale in this period has a purchase cost.</div>
            {/if}
          </article>
        </section>

        <section class="panel expense-manager">
          <div class="panel-heading table-heading">
            <div>
              <span class="kicker">BUSINESS EXPENSES</span>
              <h2>Money spent outside eBay</h2>
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
              Add costs eBay cannot see—supplies, software, show fees, equipment, advertising, and more.
            </div>
          {/if}
        </section>

        <section class="panel accounting-ledger">
          <div class="panel-heading table-heading">
            <div><span class="kicker">TRANSACTION LEDGER</span><h2>eBay money trail</h2></div>
            <span class="read-only">{filteredTransactions.length} entries</span>
          </div>
          {#if filteredTransactions.length}
            <div class="table-wrap"><table><thead><tr>
              <th>Date</th><th>Category</th><th>Description</th><th>Order</th><th class="num">Amount</th><th>P&L</th>
            </tr></thead><tbody>
              {#each filteredTransactions as transaction}
                <tr>
                  <td>{shortDate(transaction.transactionDate)}</td>
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
            <h2>Business performance</h2>
            <p>{profitIsFinal ? 'Fully costed accounting report.' : metrics.missingCogs ? `${metrics.missingCogs} sale cost${metrics.missingCogs === 1 ? '' : 's'} missing in this period.` : 'Financial data is still reconciling.'}</p>
          </div>
          <div class="report-actions">
            <button class="button primary" onclick={exportPnl}><Download size={16} /> P&L CSV</button>
            <button class="button secondary" onclick={printReport}><Printer size={16} /> Print / PDF</button>
          </div>
        </section>

        <section class="metrics-grid report-metrics" aria-label="Report summary">
          <article class="metric-card tone-green"><div class="metric-top"><span>Gross revenue</span><CircleDollarSign size={18} /></div><strong>{money(metrics.gross)}</strong><p>{filteredSales.length} sales</p></article>
          <article class="metric-card tone-blue"><div class="metric-top"><span>Known COGS</span><Tag size={18} /></div><strong>{money(metrics.cogs)}</strong><p>{metrics.missingCogs ? `${metrics.missingCogs} costs still missing` : 'Fully costed'}</p></article>
          <article class="metric-card tone-violet"><div class="metric-top"><span>Business expenses</span><ReceiptText size={18} /></div><strong>{money(metrics.businessExpenses)}</strong><p>{manualExpenses.length} manual expense${manualExpenses.length === 1 ? '' : 's'}</p></article>
          <article class="metric-card tone-amber"><div class="metric-top"><span>{profitLabel}</span><WalletCards size={18} /></div><strong>{money(metrics.profit)}</strong><p>{percent(metrics.margin)} margin</p></article>
        </section>

        <section class="reports-grid">
          <article class="panel monthly-report">
            <div class="panel-heading table-heading">
              <div><span class="kicker">MONTHLY P&L</span><h2>Performance by month</h2></div>
              <button class="button mini secondary" onclick={exportPnl}><Download size={14} /> Export</button>
            </div>
            {#if monthlyRows.length}
              <div class="table-wrap"><table><thead><tr>
                <th>Month</th><th class="num">Sales</th><th class="num">Gross</th><th class="num">eBay fees</th>
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
              <div class="empty-state compact-empty"><strong>No business expenses in this period.</strong>Your manual expense categories will appear here.</div>
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
            <button onclick={exportExpenses}><span class="export-icon"><ReceiptText size={20} /></span><span><strong>Expense report</strong><small>Manual business expenses and categories</small></span><Download size={17} /></button>
            <button onclick={exportLedger}><span class="export-icon"><WalletCards size={20} /></span><span><strong>Transaction ledger</strong><small>Every normalized financial transaction in the period</small></span><Download size={17} /></button>
          </div>
        </section>

        <section class="print-report-only">
          <header>
            <strong>NETTIVA</strong>
            <span>Business Performance Report</span>
          </header>
          <div class="print-summary">
            <div><span>Gross revenue</span><strong>{money(metrics.gross)}</strong></div>
            <div><span>eBay fees</span><strong>−{money(metrics.sellingFees)}</strong></div>
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
        <article class="connection-card">
          <div class:connected={data.connected} class="connection-hero"><PlugZap size={30} /><span>{data.connected ? 'CONNECTED' : 'NOT CONNECTED'}</span></div>
          <h2>{data.connected ? 'Your eBay store is linked' : 'Bring in your eBay business'}</h2>
          <p>{data.connected ? 'Listings, orders, and financial transactions can sync into your private workspace.' : 'Once eBay approves API access, Nettiva will sync automatically. Your transaction-history import remains available as a backup.'}</p>
          {#if data.connected}
            <button class="button primary" onclick={syncNow} disabled={syncing}><RefreshCw size={17} /> Sync listings & sales</button>
          {:else}
            <a class="button primary" href="/api/ebay/connect"><ExternalLink size={17} /> Connect eBay securely</a>
          {/if}
          <small>{data.lastSyncedAt ? `Last successful sync: ${new Date(data.lastSyncedAt).toLocaleString()}` : 'No production API sync has run yet.'}</small>
        </article>

        <article class="panel setup-checklist">
          <span class="kicker">ACCOUNTING FOUNDATION</span>
          <h2>Ready for API sync</h2>
          <ul>
            <li><Check /> Signed debit / credit ledger</li>
            <li><Check /> eBay fee breakdown</li>
            <li><Check /> Shipping-label expenses</li>
            <li><Check /> COGS and true-profit workflow</li>
            <li><Check /> Payouts excluded from P&L</li>
          </ul>
          <div class="setup-note"><BarChart3 /><span><strong>Built to reconcile</strong>API data will feed the same accounting model already proven with your real transaction history.</span></div>
        </article>

        <article class="panel advanced-card">
          <span class="kicker">ADVANCED / FALLBACK</span>
          <h2>Manual transaction history</h2>
          <p>The transaction CSV importer stays available for historical backfills, recovery, or reconciliation. We are not building Nettiva's normal workflow around CSV imports.</p>
          <a class="button secondary" href="/import"><FileSpreadsheet size={17} /> Open transaction importer</a>
        </article>
      </section>
    {/if}
  </main>
</div>

{#snippet inventoryTable(items: InventoryRow[])}
  <div class="table-wrap"><table><thead><tr><th>Item</th><th>Status</th><th>Location</th><th class="num">Purchase cost</th><th class="num">List price</th><th class="num">Age</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>
    {#each items as item}
      <tr>
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
        <td class="num"><span class:age-stale={item.ageDays >= 90}>{item.ageDays ? `${item.ageDays}d` : '—'}</span></td>
        <td class="action-cell"><button class="button mini secondary" onclick={() => openEditor(item)}>Edit</button></td>
      </tr>
    {/each}
  </tbody></table></div>
{/snippet}

{#if skuManagerOpen}
  <div class="modal-backdrop" role="presentation">
    <button class="modal-dismiss" aria-label="Close SKU manager" onclick={() => skuManagerOpen = false}></button>
    <div class="sku-manager-dialog" role="dialog" aria-modal="true" aria-labelledby="sku-manager-title">
      <button class="dialog-close" aria-label="Close" onclick={() => skuManagerOpen = false}><X size={18} /></button>
      <span class="kicker">SKU CONTROL CENTER</span>
      <h2 id="sku-manager-title">Never reuse an inventory identity</h2>
      <p class="sku-manager-intro">Bootstrap the labels already living on eBay now. Once API sync is connected, Nettiva will automatically claim SKUs from both active and scheduled listings.</p>
      <div class="sku-sequence-grid">{#each skuPrefixSummary as row}<div><span>{row.label}</span><strong>{row.nextSku}</strong><small>{row.lastNumber ? `through ${row.prefix}-${String(row.lastNumber).padStart(4, '0')} already used` : 'no numbers used yet'}</small></div>{/each}</div>
      <form class="sku-bootstrap-form" onsubmit={reserveSkus}>
        <label><span>Paste existing eBay custom labels</span><textarea bind:value={skuPaste} rows="5" placeholder={"Paste the SKU column—or even messy copied Seller Hub text.\n\nAFG-0001\nAFG-0014\nMOV-0003\nELC-0002"}></textarea></label>
        <div class="sku-bootstrap-bottom"><p><strong>Numbers only move forward.</strong> Removing a reservation never makes that sequence number available again.</p><button class="button primary" disabled={reservingSkus || !skuPaste.trim()}>{#if reservingSkus}<LoaderCircle class="spin" size={16} />{:else}<Check size={16} />{/if} Reserve detected SKUs</button></div>
      </form>
      {#if skuReserveMessage}<p class="sku-reserve-message">{skuReserveMessage}</p>{/if}
      <div class="sku-reservation-section">
        <div class="sku-reservation-heading"><div><strong>Manual bootstrap reservations</strong><small>{manualReservations.length} reservation{manualReservations.length === 1 ? '' : 's'}</small></div><span>{skuReservationsSafe.filter((row) => row.status === 'claimed').length} claimed by eBay</span></div>
        {#if manualReservations.length}<div class="sku-reservation-list">{#each manualReservations as reservation}<div class="sku-reservation-row"><strong>{reservation.sku}</strong><span>{reservation.status === 'claimed' ? 'Claimed' : 'Reserved'}</span><small>{reservation.title ?? 'Imported from your existing SKU list'}</small>{#if reservation.status === 'reserved' && !reservation.ebayItemId && !reservation.inventoryItemId}<button type="button" class="button mini secondary" disabled={deletingReservationId === reservation.id} onclick={() => deleteSkuReservation(reservation.id, reservation.sku)}>{#if deletingReservationId === reservation.id}<LoaderCircle class="spin" size={13} />{:else}<X size={13} />{/if} Remove</button>{:else}<span class="sku-claimed-lock">Locked</span>{/if}</div>{/each}</div>{:else}<div class="empty-state compact-empty"><strong>No bootstrap reservations yet.</strong>Paste your current Seller Hub custom labels above. Nettiva will ignore labels it already knows from inventory.</div>{/if}
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
      <p class="intake-intro">Capture the cost now. When this item later appears on eBay with the same unique SKU/custom label, Nettiva can reconcile the listing onto this record instead of creating a duplicate.</p>

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
            {#each inventoryCategories as category}
              <option value={category.value}>{category.label}</option>
            {/each}
          </select>
        </label>

        <label>
          <span>Quantity</span>
          <input bind:value={intakeQuantity} type="number" min="1" max="50" step="1" />
        </label>

        <label>
          <span>Purchase cost <small>each</small></span>
          <div class="money-input"><span>$</span><input bind:value={intakeCost} inputmode="decimal" placeholder="0.00" required /></div>
        </label>

        <label>
          <span>Purchase date</span>
          <input type="date" bind:value={intakeDate} />
        </label>

        <div class="sku-builder wide-field">
          <div class="sku-builder-head">
            <div>
              <strong>SKU / eBay custom label</strong>
              <small>Stable identity for future eBay matching</small>
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
              Nettiva will create {intakeQuantity} separate inventory records at {money(Math.round((Number(intakeCost) || 0) * 100))} each so every future sale gets its own COGS trail.
            </span>
          </div>
        {/if}

        <div class="intake-match-note wide-field">
          <Tag size={17} />
          <span><strong>Future eBay match</strong>Use the generated SKU as the eBay custom label. The listing title can be completely different.</span>
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
            {#each inventoryCategories as category}
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
          <p class="sku-helper wide-field">Use the same SKU/custom label when you list this on eBay. Nettiva will use a unique match to attach the future eBay listing without losing your cost or intake history.</p>
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
  {@const ebayNetProceeds = grossRevenue - selectedSale.sellingFeesCents}
  {@const refundDisputeTotal = selectedSale.refundsCents + selectedSale.disputesCents}

  <div class="modal-backdrop" role="presentation">
    <button class="modal-dismiss" aria-label="Close sale breakdown" onclick={() => selectedSale = null}></button>
    <div class="sale-dialog" role="dialog" aria-modal="true" aria-labelledby="sale-title">
      <button class="dialog-close" aria-label="Close" onclick={() => selectedSale = null}><X size={18} /></button>
      <span class="kicker">SALE BREAKDOWN</span>
      <h2 id="sale-title">{selectedSale.title}</h2>
      <p class="sale-dialog-sub">Order {selectedSale.ebayOrderId} · sold {shortDate(selectedSale.soldAt)}</p>

      <div class="money-flow">
        <section class="money-flow-section">
          <div class="money-flow-heading"><span>01</span><strong>Gross revenue</strong></div>
          <div class="money-line"><span>Item price</span><strong>{money(selectedSale.salePriceCents)}</strong></div>
          <div class="money-line"><span>Buyer-paid shipping</span><strong>{money(selectedSale.shippingChargedCents)}</strong></div>
          <div class="money-line subtotal"><span>Gross collected</span><strong>{money(grossRevenue)}</strong></div>
        </section>

        <section class="money-flow-section">
          <div class="money-flow-heading"><span>02</span><strong>eBay</strong></div>
          <div class="money-line expense"><span>Selling fees</span><strong>−{money(selectedSale.sellingFeesCents)}</strong></div>
          <div class="money-line subtotal ebay-net"><span>Order net proceeds</span><strong>{money(ebayNetProceeds)}</strong></div>
          <p class="flow-note">This is the SALE amount eBay reports after its selling fees are deducted.</p>
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
          <span><ReceiptText size={16} /> eBay ledger details</span>
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
                    <small>After eBay selling fees</small>
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
