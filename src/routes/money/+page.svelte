<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { Calculator, Check, CircleDollarSign, ReceiptText, Save, WalletCards } from '@lucide/svelte';
  import PageChrome from '$lib/components/organized/PageChrome.svelte';
  import { money, shortDate } from '$lib/money';
  import type { ExpenseCategory, FinanceCategory } from '$lib/types';
  import type { OrganizedDashboardData } from '$lib/server/organized-dashboard';

  let { data }: { data: OrganizedDashboardData } = $props();

  type Period = 'all' | '30d' | 'month' | 'ytd';
  let period = $state<Period>('all');
  let expenseDate = $state(new Date().toISOString().slice(0, 10));
  let expenseDescription = $state('');
  let expenseCategory = $state<ExpenseCategory>('shipping_supplies');
  let expenseAmount = $state('');
  let expenseMemo = $state('');
  let expenseSaving = $state(false);
  let expenseMessage = $state<string | null>(null);
  let expenseBad = $state(false);

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

  const PNL_CATEGORIES = new Set<FinanceCategory>([
    'selling_fee', 'shipping_label', 'refund', 'dispute',
    'other_fee', 'adjustment', 'withheld_tax', 'purchase', 'business_expense'
  ]);

  function startDate() {
    const now = new Date();
    if (period === 'all') return null;
    if (period === '30d') return new Date(now.getTime() - 30 * 86_400_000);
    if (period === 'month') return new Date(now.getFullYear(), now.getMonth(), 1);
    return new Date(now.getFullYear(), 0, 1);
  }

  function inPeriod(value: string) {
    const start = startDate();
    return !start || Date.parse(value) >= start.getTime();
  }

  const sales = $derived.by(() => data.sales.filter((sale) => inPeriod(sale.soldAt)));
  const transactions = $derived.by(() => data.transactions.filter((transaction) => inPeriod(transaction.transactionDate)));
  const gross = $derived(sales.reduce((sum, sale) => sum + sale.salePriceCents + sale.shippingChargedCents, 0));
  const cogs = $derived(sales.reduce((sum, sale) => sum + (sale.cogsCents ?? 0), 0));
  const missingCogs = $derived(sales.filter((sale) => sale.cogsCents == null));
  const sellingFees = $derived(transactions.reduce((sum, transaction) => sum + (transaction.category === 'selling_fee' && transaction.amountCents < 0 ? -transaction.amountCents : 0), 0));
  const shippingLabels = $derived(transactions.reduce((sum, transaction) => sum + (transaction.category === 'shipping_label' && transaction.amountCents < 0 ? -transaction.amountCents : 0), 0));
  const refunds = $derived(transactions.reduce((sum, transaction) => sum + ((transaction.category === 'refund' || transaction.category === 'dispute') && transaction.amountCents < 0 ? -transaction.amountCents : 0), 0));
  const businessExpenses = $derived(transactions.reduce((sum, transaction) => sum + (transaction.category === 'business_expense' && transaction.amountCents < 0 ? -transaction.amountCents : 0), 0));
  const otherAdjustments = $derived(transactions.reduce((sum, transaction) => sum + (['other_fee', 'adjustment', 'withheld_tax', 'purchase'].includes(transaction.category) ? transaction.amountCents : 0), 0));
  const pnlAdjustments = $derived(transactions.reduce((sum, transaction) => sum + (PNL_CATEGORIES.has(transaction.category) ? transaction.amountCents : 0), 0));
  const profit = $derived(gross + pnlAdjustments - cogs);
  const margin = $derived(gross ? (profit / gross) * 100 : 0);
  const manualExpenses = $derived(transactions.filter((transaction) => transaction.category === 'business_expense' && transaction.source === 'manual'));

  const unsold = $derived(data.inventory.filter((item) => item.status !== 'sold'));
  const missingInventory = $derived(unsold.filter((item) => item.costCents == null || !item.source?.trim() || !item.location?.trim()));
  const counts = $derived({
    inventoryAll: data.inventory.length,
    inventoryUnlisted: data.inventory.filter((item) => item.status === 'unlisted').length,
    inventoryScheduled: data.inventory.filter((item) => item.status === 'scheduled').length,
    inventoryActive: data.inventory.filter((item) => item.status === 'active').length,
    inventoryMissing: missingInventory.length,
    soldAll: data.sales.length,
    soldMissingCogs: data.sales.filter((sale) => sale.cogsCents == null).length,
    soldUnmatched: data.sales.filter((sale) => !sale.inventoryItemId).length
  });

  function percent(value: number) { return `${value.toFixed(1)}%`; }
  function signed(value: number) { return `${value >= 0 ? '+' : '−'}${money(Math.abs(value))}`; }

  async function saveExpense(event: SubmitEvent) {
    event.preventDefault();
    const amount = Number(expenseAmount);
    if (!expenseDate || !expenseDescription.trim() || !Number.isFinite(amount) || amount <= 0) {
      expenseBad = true;
      expenseMessage = 'Enter a date, description and amount greater than $0.';
      return;
    }

    expenseSaving = true;
    expenseMessage = null;
    expenseBad = false;
    const response = await fetch('/api/expenses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        date: expenseDate,
        description: expenseDescription.trim(),
        category: expenseCategory,
        amountCents: Math.round(amount * 100),
        memo: expenseMemo.trim() || null
      })
    });
    const result = await response.json().catch(() => null) as { error?: string } | null;
    expenseSaving = false;

    if (!response.ok) {
      expenseBad = true;
      expenseMessage = result?.error ?? 'Could not save expense.';
      return;
    }

    expenseDescription = '';
    expenseAmount = '';
    expenseMemo = '';
    expenseMessage = 'Expense saved.';
    await invalidateAll();
  }
</script>

<svelte:head><title>Sellquity · Money</title></svelte:head>

<PageChrome active="money-overview" eyebrow="MONEY" title="Money" workspace={data.workspace} connected={data.connected} lastSyncedAt={data.lastSyncedAt} {counts}>
  {#snippet headerActions()}
    <a class="org-button secondary" href="/money/transactions"><ReceiptText size={15} /> Transactions</a>
  {/snippet}

  <div class="org-stack">
    <section class="org-card">
      <div class="org-toolbar">
        <span class="org-kicker">REPORTING PERIOD</span>
        <div class="org-segments">
          <button class:active={period === 'all'} type="button" onclick={() => period = 'all'}>All time</button>
          <button class:active={period === '30d'} type="button" onclick={() => period = '30d'}>30 days</button>
          <button class:active={period === 'month'} type="button" onclick={() => period = 'month'}>This month</button>
          <button class:active={period === 'ytd'} type="button" onclick={() => period = 'ytd'}>YTD</button>
        </div>
      </div>
    </section>

    <section class="org-grid cols-4">
      <article class="org-card org-metric"><div class="org-metric-top"><span>Gross revenue</span><CircleDollarSign size={16} /></div><strong>{money(gross)}</strong><small>{sales.length} sales</small></article>
      <article class="org-card org-metric"><div class="org-metric-top"><span>Marketplace fees</span><ReceiptText size={16} /></div><strong>{money(sellingFees)}</strong><small>platform fees in period</small></article>
      <article class="org-card org-metric"><div class="org-metric-top"><span>Shipping labels</span><WalletCards size={16} /></div><strong>{money(shippingLabels)}</strong><small>seller-paid postage</small></article>
      <article class="org-card org-metric profit"><div class="org-metric-top"><span>{missingCogs.length ? 'Profit before missing COGS' : 'Net profit'}</span><Calculator size={16} /></div><strong>{money(profit)}</strong><small>{missingCogs.length ? `${missingCogs.length} COGS missing` : `${percent(margin)} margin`}</small></article>
    </section>

    <section class="org-grid cols-2">
      <article class="org-card">
        <div class="org-card-head"><div><span class="org-kicker">PROFIT & LOSS</span><h2>Where the money went</h2></div><Calculator size={18} /></div>
        <div class="org-profit-list">
          <div class="org-profit-row"><span>Gross sales + buyer shipping</span><strong class="org-positive">+{money(gross)}</strong></div>
          <div class="org-profit-row"><span>Marketplace fees</span><strong class="org-negative">−{money(sellingFees)}</strong></div>
          <div class="org-profit-row"><span>Shipping labels</span><strong class="org-negative">−{money(shippingLabels)}</strong></div>
          <div class="org-profit-row"><span>Refunds & disputes</span><strong class="org-negative">−{money(refunds)}</strong></div>
          <div class="org-profit-row"><span>Other fees / credits / adjustments</span><strong class:org-positive={otherAdjustments >= 0} class:org-negative={otherAdjustments < 0}>{signed(otherAdjustments)}</strong></div>
          <div class="org-profit-row"><span>Business expenses</span><strong class="org-negative">−{money(businessExpenses)}</strong></div>
          <div class="org-profit-row"><span>Known COGS</span><strong class="org-negative">−{money(cogs)}</strong></div>
          <div class="org-profit-row total"><span>{missingCogs.length ? 'Profit before missing COGS' : 'Net profit'}</span><strong>{money(profit)}</strong></div>
        </div>
        {#if missingCogs.length}<div class="org-card-head"><div><p>{missingCogs.length} sale cost{missingCogs.length === 1 ? '' : 's'} still need purchase cost before this is final.</p></div><a class="org-button secondary mini" href="/sold?quality=missing-cogs">Fix COGS</a></div>{/if}
      </article>

      <article class="org-card">
        <div class="org-card-head"><div><span class="org-kicker">BUSINESS EXPENSES</span><h2>Add an operating cost</h2><p>Supplies, software, equipment, show fees and other business-wide expenses.</p></div></div>
        <form onsubmit={saveExpense}>
          <div class="org-form-grid">
            <label class="org-field"><span>Date</span><input class="org-input" type="date" bind:value={expenseDate} required /></label>
            <label class="org-field"><span>Amount</span><input class="org-input" bind:value={expenseAmount} inputmode="decimal" placeholder="0.00" required /></label>
            <label class="org-field wide"><span>Description</span><input class="org-input" bind:value={expenseDescription} placeholder="Thermal labels, card show table…" required /></label>
            <label class="org-field"><span>Category</span><select class="org-select" bind:value={expenseCategory}>{#each expenseCategories as option}<option value={option.value}>{option.label}</option>{/each}</select></label>
            <label class="org-field"><span>Note</span><input class="org-input" bind:value={expenseMemo} placeholder="Optional" /></label>
          </div>
          {#if expenseMessage}<p class:bad={expenseBad} class="org-form-message">{expenseMessage}</p>{/if}
          <div class="org-form-actions"><button class="org-button primary" disabled={expenseSaving}>{#if expenseSaving}Saving…{:else}<Save size={14} /> Add expense{/if}</button></div>
        </form>
      </article>
    </section>

    <section class="org-card">
      <div class="org-card-head"><div><span class="org-kicker">RECENT EXPENSES</span><h2>Business-wide costs</h2></div><span class="org-pill">{manualExpenses.length} in period</span></div>
      {#if manualExpenses.length}
        <div class="org-table-wrap"><table class="org-table"><thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Note</th><th class="num">Amount</th></tr></thead><tbody>{#each manualExpenses.slice(0, 10) as expense}<tr><td>{shortDate(expense.transactionDate)}</td><td>{expense.description ?? 'Business expense'}</td><td>{expense.expenseCategory?.replace(/_/g, ' ') ?? 'Other'}</td><td>{expense.memo ?? '—'}</td><td class="num money-negative">−{money(Math.abs(expense.amountCents))}</td></tr>{/each}</tbody></table></div>
      {:else}<div class="org-empty"><Check size={20} /><strong>No manual expenses in this period.</strong>Add them above when they happen.</div>{/if}
    </section>
  </div>
</PageChrome>
