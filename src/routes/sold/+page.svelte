<script lang="ts">
  import { page } from '$app/state';
  import { ChevronRight, PackageCheck, Search } from '@lucide/svelte';
  import PageChrome from '$lib/components/organized/PageChrome.svelte';
  import { money, shortDate } from '$lib/money';
  import type { OrganizedDashboardData } from '$lib/server/organized-dashboard';

  let { data }: { data: OrganizedDashboardData } = $props();
  let query = $state('');

  const quality = $derived(page.url.searchParams.get('quality') ?? 'all');
  const missingCogs = $derived(data.sales.filter((sale) => sale.cogsCents == null));
  const unmatched = $derived(data.sales.filter((sale) => !sale.inventoryItemId));
  const unsold = $derived(data.inventory.filter((item) => item.status !== 'sold'));
  const missingInventory = $derived(unsold.filter((item) => item.costCents == null || !item.source?.trim() || !item.location?.trim()));

  const counts = $derived({
    inventoryAll: data.inventory.length,
    inventoryUnlisted: data.inventory.filter((item) => item.status === 'unlisted').length,
    inventoryScheduled: data.inventory.filter((item) => item.status === 'scheduled').length,
    inventoryActive: data.inventory.filter((item) => item.status === 'active').length,
    inventoryMissing: missingInventory.length,
    soldAll: data.sales.length,
    soldMissingCogs: missingCogs.length,
    soldUnmatched: unmatched.length
  });

  const filtered = $derived.by(() => {
    const needle = query.trim().toLowerCase();
    return data.sales.filter((sale) => {
      if (quality === 'missing-cogs' && sale.cogsCents != null) return false;
      if (quality === 'unmatched' && sale.inventoryItemId) return false;
      if (!needle) return true;
      return `${sale.title} ${sale.ebayOrderId} ${sale.ebayItemId ?? ''}`.toLowerCase().includes(needle);
    });
  });

  const gross = $derived(data.sales.reduce((sum, sale) => sum + sale.salePriceCents + sale.shippingChargedCents, 0));
  const profit = $derived(data.sales.reduce((sum, sale) => sum + sale.netProfitCents, 0));
  const avgMargin = $derived(gross ? (profit / gross) * 100 : 0);

  function percent(value: number) { return `${value.toFixed(1)}%`; }
</script>

<svelte:head><title>Sellquity · Sold</title></svelte:head>

<PageChrome active={quality === 'missing-cogs' ? 'sold-missing-cogs' : quality === 'unmatched' ? 'sold-unmatched' : 'sold-all'} eyebrow="SOLD" title="Sold" workspace={data.workspace} connected={data.connected} lastSyncedAt={data.lastSyncedAt} {counts}>
  <div class="org-stack">
    <section class="org-grid cols-3">
      <article class="org-card org-metric"><div class="org-metric-top"><span>Gross sold</span><PackageCheck size={16} /></div><strong>{money(gross)}</strong><small>{data.sales.length} tracked sale{data.sales.length === 1 ? '' : 's'}</small></article>
      <article class="org-card org-metric profit"><div class="org-metric-top"><span>Tracked profit</span><PackageCheck size={16} /></div><strong>{money(profit)}</strong><small>{missingCogs.length ? `${missingCogs.length} sale cost${missingCogs.length === 1 ? '' : 's'} still missing` : `${percent(avgMargin)} margin`}</small></article>
      <article class="org-card org-metric"><div class="org-metric-top"><span>Needs review</span><PackageCheck size={16} /></div><strong>{missingCogs.length + unmatched.length}</strong><small>{missingCogs.length} COGS · {unmatched.length} unmatched</small></article>
    </section>

    <section class="org-card">
      <div class="org-toolbar">
        <label class="org-search"><Search size={16} /><input class="org-input" bind:value={query} placeholder="Search sold products or order ID…" /></label>
        <div class="org-segments">
          <a class:active={quality === 'all'} href="/sold">All sold</a>
          <a class:active={quality === 'missing-cogs'} href="/sold?quality=missing-cogs">Missing COGS</a>
          <a class:active={quality === 'unmatched'} href="/sold?quality=unmatched">Unmatched</a>
        </div>
      </div>

      {#if filtered.length}
        <div class="org-table-wrap">
          <table class="org-table">
            <thead><tr><th>Product</th><th>Sold</th><th class="num">Gross</th><th class="num">Marketplace costs</th><th class="num">COGS</th><th class="num">Net profit</th><th class="num">Margin</th><th class="num">ROI</th><th></th></tr></thead>
            <tbody>
              {#each filtered as sale}
                {@const item = data.inventory.find((candidate) => candidate.id === sale.inventoryItemId)}
                <tr>
                  <td class="title"><a href={`/sold/${encodeURIComponent(sale.id)}`}>{#if item?.imageUrl}<img class="org-item-thumb" src={item.imageUrl} alt="" />{:else}<span class="org-item-thumb"></span>{/if}<span><strong>{sale.title}</strong><small>{sale.ebayOrderId}{item?.sku ? ` · ${item.sku}` : ''}</small></span></a></td>
                  <td>{shortDate(sale.soldAt)}</td>
                  <td class="num">{money(sale.salePriceCents + sale.shippingChargedCents)}</td>
                  <td class="num money-negative">−{money(Math.max(0, -sale.pnlAdjustmentsCents))}</td>
                  <td class:org-warning={sale.cogsCents == null} class="num">{sale.cogsCents == null ? 'Missing' : `−${money(sale.cogsCents)}`}</td>
                  <td class="num money-positive">{money(sale.netProfitCents)}</td>
                  <td class="num">{percent(sale.margin)}</td>
                  <td class="num">{sale.roi == null ? '—' : percent(sale.roi)}</td>
                  <td class="num"><a class="org-button ghost mini" href={`/sold/${encodeURIComponent(sale.id)}`}>Breakdown <ChevronRight size={12} /></a></td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {:else}
        <div class="org-empty"><strong>No sold items match this view.</strong>Try another queue or search term.</div>
      {/if}
    </section>
  </div>
</PageChrome>
