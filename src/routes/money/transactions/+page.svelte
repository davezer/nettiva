<script lang="ts">
  import { Search, WalletCards } from '@lucide/svelte';
  import PageChrome from '$lib/components/organized/PageChrome.svelte';
  import { money, shortDate } from '$lib/money';
  import type { OrganizedDashboardData } from '$lib/server/organized-dashboard';

  let { data }: { data: OrganizedDashboardData } = $props();
  let query = $state('');
  let category = $state('all');

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

  const categories = $derived([...new Set(data.transactions.map((transaction) => transaction.category))].sort());
  const filtered = $derived.by(() => {
    const needle = query.trim().toLowerCase();
    return data.transactions.filter((transaction) => {
      if (category !== 'all' && transaction.category !== category) return false;
      if (!needle) return true;
      return [transaction.description, transaction.transactionType, transaction.ebayOrderId, transaction.feeType, transaction.memo]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  });

  function signed(value: number) { return `${value >= 0 ? '+' : '−'}${money(Math.abs(value))}`; }
</script>

<svelte:head><title>Sellquity · Transactions</title></svelte:head>

<PageChrome active="money-transactions" eyebrow="MONEY" title="Transactions" workspace={data.workspace} connected={data.connected} lastSyncedAt={data.lastSyncedAt} {counts}>
  <div class="org-stack">
    <section class="org-card">
      <div class="org-toolbar">
        <label class="org-search"><Search size={16} /><input class="org-input" bind:value={query} placeholder="Search order, fee, memo or transaction…" /></label>
        <select class="org-select" style="width:auto;min-width:180px" bind:value={category}><option value="all">All categories</option>{#each categories as option}<option value={option}>{option.replace(/_/g, ' ')}</option>{/each}</select>
      </div>

      {#if filtered.length}
        <div class="org-table-wrap"><table class="org-table"><thead><tr><th>Date</th><th>Channel</th><th>Category</th><th>Description</th><th>Order</th><th>Source</th><th class="num">Amount</th></tr></thead><tbody>{#each filtered as transaction}<tr><td>{shortDate(transaction.transactionDate)}</td><td><span class="org-pill">{transaction.marketplaceProvider ?? (transaction.source === 'manual' ? 'manual' : 'ebay')}</span></td><td>{transaction.category.replace(/_/g, ' ')}</td><td>{transaction.feeType || transaction.description || transaction.transactionType}</td><td>{transaction.ebayOrderId ?? '—'}</td><td>{transaction.source}</td><td class:money-positive={transaction.amountCents > 0} class:money-negative={transaction.amountCents < 0} class="num">{signed(transaction.amountCents)}</td></tr>{/each}</tbody></table></div>
      {:else}<div class="org-empty"><WalletCards size={20} /><strong>No transactions match this view.</strong>Try a different search or category.</div>{/if}
    </section>
  </div>
</PageChrome>
