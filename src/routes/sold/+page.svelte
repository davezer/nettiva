<script lang="ts">
  import { page } from '$app/state';
  import { AlertTriangle, Check, ChevronRight, CircleDollarSign, Link2Off, PackageCheck, Search } from '@lucide/svelte';
  import PageChrome from '$lib/components/organized/PageChrome.svelte';
  import { money, shortDate } from '$lib/money';
  import type { OrganizedDashboardData } from '$lib/server/organized-dashboard';

  let { data }: { data: OrganizedDashboardData } = $props();
  let query = $state('');

  const quality = $derived(page.url.searchParams.get('quality') ?? 'all');
  const missingCosts = $derived(data.sales.filter((sale) => sale.cogsCents == null));
  const unmatched = $derived(data.sales.filter((sale) => !sale.inventoryItemId));
  const complete = $derived(data.sales.filter((sale) => sale.cogsCents != null && sale.inventoryItemId));
  const unsold = $derived(data.inventory.filter((item) => item.status !== 'sold'));
  const missingInventory = $derived(unsold.filter((item) => item.costCents == null || !item.source?.trim() || !item.location?.trim()));

  const counts = $derived({
    inventoryAll: unsold.length,
    inventoryUnlisted: data.inventory.filter((item) => item.status === 'unlisted').length,
    inventoryScheduled: data.inventory.filter((item) => item.status === 'scheduled').length,
    inventoryActive: data.inventory.filter((item) => item.status === 'active').length,
    inventoryMissing: missingInventory.length,
    soldAll: data.sales.length,
    soldMissingCogs: missingCosts.length,
    soldUnmatched: unmatched.length
  });

  const filtered = $derived.by(() => {
    const needle = query.trim().toLowerCase();
    return data.sales.filter((sale) => {
      if (quality === 'missing-cogs' && sale.cogsCents != null) return false;
      if (quality === 'unmatched' && sale.inventoryItemId) return false;
      if (quality === 'complete' && (sale.cogsCents == null || !sale.inventoryItemId)) return false;
      if (!needle) return true;
      return `${sale.title} ${sale.ebayOrderId} ${sale.ebayItemId ?? ''}`.toLowerCase().includes(needle);
    });
  });

  const gross = $derived(data.sales.reduce((sum, sale) => sum + sale.salePriceCents + sale.shippingChargedCents, 0));
  const completeGross = $derived(complete.reduce((sum, sale) => sum + sale.salePriceCents + sale.shippingChargedCents, 0));
  const completeProfit = $derived(complete.reduce((sum, sale) => sum + sale.netProfitCents, 0));
  const completeMargin = $derived(completeGross ? (completeProfit / completeGross) * 100 : 0);

  function percent(value: number) { return `${value.toFixed(1)}%`; }
</script>

<svelte:head><title>Sellquity · Sales</title></svelte:head>

<PageChrome active="sold-all" eyebrow="SALES" title="Sales" workspace={data.workspace} connected={data.connected} lastSyncedAt={data.lastSyncedAt} {counts}>
  <div class="org-stack">
    <section class="org-grid cols-3">
      <article class="org-card org-metric">
        <div class="org-metric-top"><span>Gross sales</span><PackageCheck size={16} /></div>
        <strong>{money(gross)}</strong>
        <small>{data.sales.length} tracked sale{data.sales.length === 1 ? '' : 's'}</small>
      </article>
      <article class="org-card org-metric profit">
        <div class="org-metric-top"><span>Profit on complete sales</span><CircleDollarSign size={16} /></div>
        <strong>{money(completeProfit)}</strong>
        <small>{complete.length ? `${percent(completeMargin)} margin across ${complete.length} complete sales` : 'Add purchase costs to calculate profit'}</small>
      </article>
      <article class="org-card org-metric">
        <div class="org-metric-top"><span>Needs attention</span><AlertTriangle size={16} /></div>
        <strong>{missingCosts.length + unmatched.length}</strong>
        <small>{missingCosts.length} need cost · {unmatched.length} need matching</small>
      </article>
    </section>

    {#if missingCosts.length > 0 || unmatched.length > 0}
      <section class="sales-action-grid">
        {#if missingCosts.length}
          <a href="/cogs" class="sales-action-card warn">
            <span class="sales-action-icon"><CircleDollarSign size={18} /></span>
            <span><strong>Add purchase costs</strong><small>{missingCosts.length} sold item{missingCosts.length === 1 ? '' : 's'} cannot show final profit yet.</small></span>
            <ChevronRight size={15} />
          </a>
        {/if}
        {#if unmatched.length}
          <a href="/sold?quality=unmatched" class="sales-action-card bad">
            <span class="sales-action-icon"><Link2Off size={18} /></span>
            <span><strong>Match sold items</strong><small>{unmatched.length} sale{unmatched.length === 1 ? '' : 's'} could not be linked to tracked inventory.</small></span>
            <ChevronRight size={15} />
          </a>
        {/if}
      </section>
    {/if}

    <section class="org-card">
      <div class="org-toolbar sales-toolbar">
        <label class="org-search"><Search size={16} /><input class="org-input" bind:value={query} placeholder="Search product or order ID…" /></label>
        <div class="org-segments">
          <a class:active={quality === 'all'} href="/sold">All</a>
          <a class:active={quality === 'complete'} href="/sold?quality=complete">Complete</a>
          <a class:active={quality === 'missing-cogs'} href="/sold?quality=missing-cogs">Needs cost</a>
          <a class:active={quality === 'unmatched'} href="/sold?quality=unmatched">Unmatched</a>
        </div>
      </div>

      {#if filtered.length}
        <div class="org-table-wrap">
          <table class="org-table">
            <thead><tr><th>Item</th><th>Sold</th><th class="num">Gross</th><th class="num">Selling costs</th><th class="num">Purchase cost</th><th class="num">Profit</th><th class="num">Margin</th><th></th></tr></thead>
            <tbody>
              {#each filtered as sale}
                {@const item = data.inventory.find((candidate) => candidate.id === sale.inventoryItemId)}
                <tr>
                  <td class="title">
                    <a href={`/sold/${encodeURIComponent(sale.id)}`}>
                      {#if item?.imageUrl}<img class="org-item-thumb" src={item.imageUrl} alt="" />{:else}<span class="org-item-thumb"></span>{/if}
                      <span><strong>{sale.title}</strong><small>{sale.ebayOrderId}{item?.sku ? ` · ${item.sku}` : ''}</small></span>
                    </a>
                  </td>
                  <td>{shortDate(sale.soldAt)}</td>
                  <td class="num">{money(sale.salePriceCents + sale.shippingChargedCents)}</td>
                  <td class="num money-negative">−{money(Math.max(0, -sale.pnlAdjustmentsCents))}</td>
                  <td class:org-warning={sale.cogsCents == null} class="num">{sale.cogsCents == null ? 'Add cost' : `−${money(sale.cogsCents)}`}</td>
                  <td class="num" class:money-positive={sale.cogsCents != null} class:org-warning={sale.cogsCents == null}>{sale.cogsCents == null ? 'Estimated' : money(sale.netProfitCents)}</td>
                  <td class="num">{sale.cogsCents == null ? '—' : percent(sale.margin)}</td>
                  <td class="num"><a class="org-button ghost mini" href={`/sold/${encodeURIComponent(sale.id)}`}>Details <ChevronRight size={12} /></a></td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {:else}
        <div class="org-empty"><Check size={20} /><strong>No sales match this view.</strong>Try another filter or search term.</div>
      {/if}
    </section>
  </div>
</PageChrome>

<style>
  .sales-action-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .sales-action-card {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    border: 1px solid #294354;
    border-radius: 12px;
    padding: 14px;
    color: #dbe8ef;
    background: #0a1721;
    text-decoration: none;
  }
  .sales-action-card.warn { border-color: #5c4726; }
  .sales-action-card.bad { border-color: #5b3138; }
  .sales-action-card:hover { background: #0d1d29; }
  .sales-action-icon { width: 36px; height: 36px; display: grid; place-items: center; border-radius: 9px; color: #e5bb70; background: #251d10; }
  .sales-action-card.bad .sales-action-icon { color: #f18e98; background: #261318; }
  .sales-action-card > span:nth-child(2) { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  .sales-action-card strong { font-size: .76rem; }
  .sales-action-card small { color: #738b9b; font-size: .64rem; line-height: 1.45; }
  .sales-toolbar { gap: 14px; }
  @media (max-width: 760px) { .sales-action-grid { grid-template-columns: 1fr; } .sales-toolbar { align-items: stretch; flex-direction: column; } }
</style>
