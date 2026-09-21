<script lang="ts">
  import { AlertTriangle, Check, ChevronLeft, ChevronRight, CircleDollarSign, Link2Off, PackageCheck, Search } from '@lucide/svelte';
  import PageChrome from '$lib/components/organized/PageChrome.svelte';
  import { money, shortDate } from '$lib/money';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const shell = $derived(data.shell);
  const result = $derived(data.sales);
  const counts = $derived(shell.counts);
  const filters = $derived(result.filters);
  const pager = $derived(result.pagination);
  const summary = $derived(result.summary);
  const completeMargin = $derived(summary.completeGrossCents ? (summary.completeProfitCents / summary.completeGrossCents) * 100 : 0);

  function salesHref(overrides: { page?: number; quality?: string; query?: string } = {}) {
    const params = new URLSearchParams();
    const quality = overrides.quality ?? filters.quality;
    const query = overrides.query ?? filters.query;
    const page = overrides.page ?? 1;
    if (quality !== 'all') params.set('quality', quality);
    if (query) params.set('q', query);
    if (page > 1) params.set('page', String(page));
    const queryString = params.toString();
    return queryString ? `/sold?${queryString}` : '/sold';
  }

  function percent(value: number) { return `${value.toFixed(1)}%`; }
</script>

<svelte:head><title>Sellquity · Sales</title></svelte:head>

<PageChrome active="sold-all" eyebrow="SALES" title="Sales" workspace={shell.workspace} connected={shell.connected} lastSyncedAt={shell.lastSyncedAt} {counts}>
  <div class="org-stack">
    <section class="org-grid cols-3">
      <article class="org-card org-metric">
        <div class="org-metric-top"><span>Gross sales</span><PackageCheck size={16} /></div>
        <strong>{money(summary.grossCents)}</strong>
        <small>{summary.totalSales} tracked sale{summary.totalSales === 1 ? '' : 's'}</small>
      </article>
      <article class="org-card org-metric profit">
        <div class="org-metric-top"><span>Profit on complete sales</span><CircleDollarSign size={16} /></div>
        <strong>{money(summary.completeProfitCents)}</strong>
        <small>{summary.completeSales ? `${percent(completeMargin)} margin across ${summary.completeSales} complete sales` : 'Add purchase costs to calculate profit'}</small>
      </article>
      <article class="org-card org-metric">
        <div class="org-metric-top"><span>Needs attention</span><AlertTriangle size={16} /></div>
        <strong>{summary.missingCosts}</strong>
        <small>{summary.missingCosts} need cost · {summary.unmatched} need matching</small>
      </article>
    </section>

    {#if summary.missingCosts > 0 || summary.unmatched > 0}
      <section class="sales-action-grid">
        {#if summary.missingCosts}
          <a href="/cogs" class="sales-action-card warn">
            <span class="sales-action-icon"><CircleDollarSign size={18} /></span>
            <span><strong>Add purchase costs</strong><small>{summary.missingCosts} sold item{summary.missingCosts === 1 ? '' : 's'} cannot show final profit yet.</small></span>
            <ChevronRight size={15} />
          </a>
        {/if}
        {#if summary.unmatched}
          <a href="/sold?quality=unmatched" class="sales-action-card bad">
            <span class="sales-action-icon"><Link2Off size={18} /></span>
            <span><strong>Match sold items</strong><small>{summary.unmatched} sale{summary.unmatched === 1 ? '' : 's'} could not be linked to tracked inventory.</small></span>
            <ChevronRight size={15} />
          </a>
        {/if}
      </section>
    {/if}

    <section class="org-card">
      <form method="GET" class="org-toolbar sales-toolbar">
        {#if filters.quality !== 'all'}<input type="hidden" name="quality" value={filters.quality} />{/if}
        <label class="org-search"><Search size={16} /><input class="org-input" name="q" value={filters.query} placeholder="Search product, SKU or order ID…" /></label>
        <div class="search-actions">
          {#if filters.query}<a class="org-button ghost mini" href={salesHref({ query: '' })}>Clear</a>{/if}
          <button class="org-button secondary mini" type="submit">Search</button>
        </div>
      </form>

      <div class="filter-row">
        <div class="org-segments">
          <a class:active={filters.quality === 'all'} href="/sold">All</a>
          <a class:active={filters.quality === 'complete'} href="/sold?quality=complete">Complete</a>
          <a class:active={filters.quality === 'missing-cogs'} href="/sold?quality=missing-cogs">Needs cost</a>
          <a class:active={filters.quality === 'unmatched'} href="/sold?quality=unmatched">Unmatched</a>
        </div>
        <span>{pager.total ? `${pager.from}–${pager.to} of ${pager.total}` : '0 sales'}</span>
      </div>

      {#if result.sales.length}
        <div class="org-table-wrap">
          <table class="org-table">
            <thead><tr><th>Item</th><th>Sold</th><th class="num">Gross</th><th class="num">Selling costs</th><th class="num">Purchase cost</th><th class="num">Profit</th><th class="num">Margin</th><th></th></tr></thead>
            <tbody>
              {#each result.sales as sale}
                <tr>
                  <td class="title">
                    <a href={`/sold/${encodeURIComponent(sale.id)}`}>
                      {#if sale.imageUrl}<img class="org-item-thumb" src={sale.imageUrl} alt="" />{:else}<span class="org-item-thumb"></span>{/if}
                      <span><strong>{sale.title}</strong><small>{sale.ebayOrderId}{sale.sku ? ` · ${sale.sku}` : ''}</small></span>
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

      {#if pager.pageCount > 1}
        <nav class="pager" aria-label="Sales pages">
          {#if pager.page > 1}<a class="org-button secondary mini" href={salesHref({ page: pager.page - 1 })}><ChevronLeft size={13} /> Previous</a>{:else}<span></span>{/if}
          <span>Page <strong>{pager.page}</strong> of {pager.pageCount}</span>
          {#if pager.page < pager.pageCount}<a class="org-button secondary mini" href={salesHref({ page: pager.page + 1 })}>Next <ChevronRight size={13} /></a>{:else}<span></span>{/if}
        </nav>
      {/if}
    </section>
  </div>
</PageChrome>

<style>
  .sales-action-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
  .sales-action-card { display:grid; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; gap:12px; border:1px solid #294354; border-radius:12px; padding:14px; color:#dbe8ef; background:#0a1721; text-decoration:none; }
  .sales-action-card.warn { border-color:#5c4726; }
  .sales-action-card.bad { border-color:#5b3138; }
  .sales-action-card:hover { background:#0d1d29; }
  .sales-action-icon { width:36px; height:36px; display:grid; place-items:center; border-radius:9px; color:#e5bb70; background:#251d10; }
  .sales-action-card.bad .sales-action-icon { color:#f18e98; background:#261318; }
  .sales-action-card > span:nth-child(2) { min-width:0; display:flex; flex-direction:column; gap:3px; }
  .sales-action-card strong { font-size:.76rem; }
  .sales-action-card small { color:#738b9b; font-size:.64rem; line-height:1.45; }
  .sales-toolbar { gap:12px; }
  .sales-toolbar .org-search { flex:1; }
  .search-actions { display:flex; gap:7px; }
  .filter-row { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:10px 14px; border-top:1px solid #172d3d; color:#66818f; font-size:.62rem; }
  .pager { display:grid; grid-template-columns:1fr auto 1fr; align-items:center; gap:12px; padding:14px; border-top:1px solid #1c3547; color:#718a99; font-size:.66rem; }
  .pager > :last-child { justify-self:end; }
  @media (max-width:760px) {
    .sales-action-grid { grid-template-columns:1fr; }
    .sales-toolbar { align-items:stretch; flex-direction:column; }
    .search-actions { justify-content:flex-end; }
    .filter-row { align-items:stretch; flex-direction:column; }
  }
</style>
