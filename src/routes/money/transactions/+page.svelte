<script lang="ts">
  import { ChevronLeft, ChevronRight, Search, WalletCards } from '@lucide/svelte';
  import PageChrome from '$lib/components/organized/PageChrome.svelte';
  import { money, shortDate } from '$lib/money';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const shell = $derived(data.shell);
  const ledger = $derived(data.ledger);
  const counts = $derived(shell.counts);
  const filters = $derived(ledger.filters);
  const pager = $derived(ledger.pagination);

  function transactionHref(overrides: { page?: number; query?: string; category?: string } = {}) {
    const params = new URLSearchParams();
    const query = overrides.query ?? filters.query;
    const category = overrides.category ?? filters.category;
    const page = overrides.page ?? 1;
    if (query) params.set('q', query);
    if (category !== 'all') params.set('category', category);
    if (page > 1) params.set('page', String(page));
    const queryString = params.toString();
    return queryString ? `/money/transactions?${queryString}` : '/money/transactions';
  }

  function signed(value: number) { return `${value >= 0 ? '+' : '−'}${money(Math.abs(value))}`; }
</script>

<svelte:head><title>Sellquity · Transactions</title></svelte:head>

<PageChrome active="money-transactions" eyebrow="MONEY" title="Transactions" workspace={shell.workspace} connected={shell.connected} lastSyncedAt={shell.lastSyncedAt} {counts}>
  <div class="org-stack">
    <section class="org-card">
      <form method="GET" class="org-toolbar transaction-toolbar">
        <label class="org-search"><Search size={16} /><input class="org-input" name="q" value={filters.query} placeholder="Search order, fee, memo or transaction…" /></label>
        <select class="org-select" name="category" value={filters.category} style="width:auto;min-width:180px">
          <option value="all" selected={filters.category === 'all'}>All categories</option>
          {#each ledger.categories as option}<option value={option} selected={filters.category === option}>{option.replace(/_/g, ' ')}</option>{/each}
        </select>
        <div class="search-actions">
          {#if filters.query || filters.category !== 'all'}<a class="org-button ghost mini" href="/money/transactions">Clear</a>{/if}
          <button class="org-button secondary mini" type="submit">Apply</button>
        </div>
      </form>

      <div class="result-meta">
        <span>{pager.total ? `${pager.from}–${pager.to} of ${pager.total}` : '0 transactions'}</span>
        <span>100 per page</span>
      </div>

      {#if ledger.transactions.length}
        <div class="org-table-wrap">
          <table class="org-table">
            <thead><tr><th>Date</th><th>Channel</th><th>Category</th><th>Description</th><th>Order</th><th>Source</th><th class="num">Amount</th></tr></thead>
            <tbody>
              {#each ledger.transactions as transaction}
                <tr>
                  <td>{shortDate(transaction.transactionDate)}</td>
                  <td><span class="org-pill">{transaction.marketplaceProvider}</span></td>
                  <td>{transaction.category.replace(/_/g, ' ')}</td>
                  <td>{transaction.feeType || transaction.description || transaction.transactionType}</td>
                  <td>{transaction.ebayOrderId ?? '—'}</td>
                  <td>{transaction.source}</td>
                  <td class:money-positive={transaction.amountCents > 0} class:money-negative={transaction.amountCents < 0} class="num">{signed(transaction.amountCents)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {:else}
        <div class="org-empty"><WalletCards size={20} /><strong>No transactions match this view.</strong>Try a different search or category.</div>
      {/if}

      {#if pager.pageCount > 1}
        <nav class="pager" aria-label="Transaction pages">
          {#if pager.page > 1}<a class="org-button secondary mini" href={transactionHref({ page: pager.page - 1 })}><ChevronLeft size={13} /> Previous</a>{:else}<span></span>{/if}
          <span>Page <strong>{pager.page}</strong> of {pager.pageCount}</span>
          {#if pager.page < pager.pageCount}<a class="org-button secondary mini" href={transactionHref({ page: pager.page + 1 })}>Next <ChevronRight size={13} /></a>{:else}<span></span>{/if}
        </nav>
      {/if}
    </section>
  </div>
</PageChrome>

<style>
  .transaction-toolbar { gap:10px; }
  .transaction-toolbar .org-search { flex:1; }
  .search-actions { display:flex; gap:7px; }
  .result-meta { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:9px 14px; border-top:1px solid #172d3d; color:#66818f; font-size:.62rem; }
  .pager { display:grid; grid-template-columns:1fr auto 1fr; align-items:center; gap:12px; padding:14px; border-top:1px solid #1c3547; color:#718a99; font-size:.66rem; }
  .pager > :last-child { justify-self:end; }
  @media (max-width:760px) {
    .transaction-toolbar { align-items:stretch; flex-direction:column; }
    .transaction-toolbar .org-select { width:100% !important; }
    .search-actions { justify-content:flex-end; }
  }
</style>
