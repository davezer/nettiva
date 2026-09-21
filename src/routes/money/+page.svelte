<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { AlertTriangle, Calculator, Check, CircleDollarSign, ReceiptText, Save, WalletCards } from '@lucide/svelte';
  import PageChrome from '$lib/components/organized/PageChrome.svelte';
  import { money, shortDate } from '$lib/money';
  import type { ExpenseCategory } from '$lib/types';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const shell = $derived(data.shell);
  const report = $derived(data.report);
  const counts = $derived(shell.counts);

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

<PageChrome active="money-overview" eyebrow="MONEY" title="Money" workspace={shell.workspace} connected={shell.connected} lastSyncedAt={shell.lastSyncedAt} {counts}>
  {#snippet headerActions()}
    <a class="org-button secondary" href="/money/transactions"><ReceiptText size={15} /> Transactions</a>
  {/snippet}

  <div class="org-stack">
    <section class="org-card">
      <div class="org-toolbar">
        <div>
          <span class="org-kicker">REPORTING PERIOD</span>
          <p style="margin:4px 0 0;color:#66818f;font-size:.67rem">These totals are calculated in the database, not from a capped browser list.</p>
        </div>
        <div class="org-segments">
          <a class:active={report.period === 'month'} href="/money?period=month">This month</a>
          <a class:active={report.period === '30d'} href="/money?period=30d">30 days</a>
          <a class:active={report.period === 'ytd'} href="/money?period=ytd">YTD</a>
          <a class:active={report.period === 'all'} href="/money?period=all">All time</a>
        </div>
      </div>
    </section>

    {#if report.missingCosts}
      <section class="org-card pad" style="border-color:#604d27;background:#17140d">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap">
          <div style="display:flex;align-items:flex-start;gap:10px">
            <AlertTriangle size={18} />
            <div>
              <strong>{report.missingCosts} sale{report.missingCosts === 1 ? '' : 's'} still need purchase cost</strong>
              <p style="margin:5px 0 0;color:#8f846a;font-size:.68rem;line-height:1.5">Profit is estimated until those costs are filled in. Gross sales and marketplace charges are still shown normally.</p>
            </div>
          </div>
          <a class="org-button secondary" href="/cogs">Add purchase costs</a>
        </div>
      </section>
    {/if}

    <section class="org-grid cols-4">
      <article class="org-card org-metric"><div class="org-metric-top"><span>Gross sales</span><CircleDollarSign size={16} /></div><strong>{money(report.grossCents)}</strong><small>{report.salesCount} sale{report.salesCount === 1 ? '' : 's'}</small></article>
      <article class="org-card org-metric"><div class="org-metric-top"><span>Marketplace fees</span><ReceiptText size={16} /></div><strong>{money(report.sellingFeesCents)}</strong><small>selling fees</small></article>
      <article class="org-card org-metric"><div class="org-metric-top"><span>Shipping labels</span><WalletCards size={16} /></div><strong>{money(report.shippingLabelsCents)}</strong><small>seller-paid postage</small></article>
      <article class="org-card org-metric profit"><div class="org-metric-top"><span>{report.missingCosts ? 'Estimated profit' : 'Net profit'}</span><Calculator size={16} /></div><strong>{money(report.profitCents)}</strong><small>{report.missingCosts ? `${report.missingCosts} purchase cost${report.missingCosts === 1 ? '' : 's'} missing` : `${percent(report.margin)} margin`}</small></article>
    </section>

    <section class="org-grid cols-2">
      <article class="org-card">
        <div class="org-card-head"><div><span class="org-kicker">PROFIT BREAKDOWN</span><h2>From sales to profit</h2><p>The money Sellquity can currently account for in this period.</p></div><Calculator size={18} /></div>
        <div class="org-profit-list">
          <div class="org-profit-row"><span>Sales + buyer-paid shipping</span><strong class="org-positive">+{money(report.grossCents)}</strong></div>
          <div class="org-profit-row"><span>Selling fees</span><strong class="org-negative">−{money(report.sellingFeesCents)}</strong></div>
          <div class="org-profit-row"><span>Shipping labels</span><strong class="org-negative">−{money(report.shippingLabelsCents)}</strong></div>
          <div class="org-profit-row"><span>Refunds & disputes</span><strong class="org-negative">−{money(report.refundsCents)}</strong></div>
          <div class="org-profit-row"><span>Other fees / credits / adjustments</span><strong class:org-positive={report.otherAdjustmentsCents >= 0} class:org-negative={report.otherAdjustmentsCents < 0}>{signed(report.otherAdjustmentsCents)}</strong></div>
          <div class="org-profit-row"><span>Business expenses</span><strong class="org-negative">−{money(report.businessExpensesCents)}</strong></div>
          <div class="org-profit-row"><span>Purchase cost of sold items</span><strong class="org-negative">−{money(report.knownCogsCents)}</strong></div>
          <div class="org-profit-row total"><span>{report.missingCosts ? 'Estimated profit' : 'Net profit'}</span><strong>{money(report.profitCents)}</strong></div>
        </div>
      </article>

      <article class="org-card">
        <div class="org-card-head"><div><span class="org-kicker">BUSINESS EXPENSE</span><h2>Add an expense</h2><p>Record costs that belong to the business instead of one specific inventory item.</p></div></div>
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
      <div class="org-card-head"><div><span class="org-kicker">RECENT EXPENSES</span><h2>Business-wide costs</h2></div><span class="org-pill">latest {report.manualExpenses.length}</span></div>
      {#if report.manualExpenses.length}
        <div class="org-table-wrap"><table class="org-table"><thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Note</th><th class="num">Amount</th></tr></thead><tbody>{#each report.manualExpenses as expense}<tr><td>{shortDate(expense.transactionDate)}</td><td>{expense.description ?? 'Business expense'}</td><td>{expense.expenseCategory?.replace(/_/g, ' ') ?? 'Other'}</td><td>{expense.memo ?? '—'}</td><td class="num money-negative">−{money(Math.abs(expense.amountCents))}</td></tr>{/each}</tbody></table></div>
      {:else}<div class="org-empty"><Check size={20} /><strong>No manual expenses in this period.</strong>Add them above when they happen.</div>{/if}
    </section>
  </div>
</PageChrome>
