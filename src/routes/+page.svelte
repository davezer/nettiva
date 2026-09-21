<script lang="ts">
  import {
    AlertTriangle,
    ArrowUpRight,
    Boxes,
    Check,
    ChevronRight,
    CircleDollarSign,
    ClipboardCheck,
    Clock3,
    PackageCheck,
    ShoppingBag,
    TrendingUp
  } from '@lucide/svelte';
  import PageChrome from '$lib/components/organized/PageChrome.svelte';
  import { money, shortDate } from '$lib/money';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const shell = $derived(data.shell);
  const overview = $derived(data.overview);
  const counts = $derived(shell.counts);

  const attention = $derived.by(() => {
    const rows: Array<{
      href: string;
      title: string;
      detail: string;
      count: number;
      severity: 'bad' | 'warn';
    }> = [];

    if (counts.soldMissingCogs) rows.push({
      href: '/cogs',
      title: 'Sales need purchase costs',
      detail: 'Add what you paid so profit and ROI can be finalized.',
      count: counts.soldMissingCogs,
      severity: 'bad'
    });

    if (counts.soldUnmatched) rows.push({
      href: '/sold?quality=unmatched',
      title: 'Sales need to be matched',
      detail: 'Review sales that could not be linked to tracked inventory.',
      count: counts.soldUnmatched,
      severity: 'bad'
    });

    if (counts.inventoryMissing) rows.push({
      href: '/inventory?quality=missing',
      title: 'Inventory needs information',
      detail: 'Cost, source, or storage location is still missing.',
      count: counts.inventoryMissing,
      severity: 'warn'
    });

    if (overview.staleCount) rows.push({
      href: '/inventory?status=active&age=stale',
      title: 'Listings have been active for 90+ days',
      detail: 'Older inventory may be worth repricing or promoting.',
      count: overview.staleCount,
      severity: 'warn'
    });

    return rows;
  });

  const attentionCount = $derived(attention.reduce((sum, item) => sum + item.count, 0));

  function percent(value: number) {
    return `${value.toFixed(1)}%`;
  }
</script>

<svelte:head><title>Sellquity · Home</title></svelte:head>

<PageChrome
  active="home"
  eyebrow="BUSINESS OVERVIEW"
  title="Home"
  workspace={shell.workspace}
  connected={shell.connected}
  lastSyncedAt={shell.lastSyncedAt}
  {counts}
>
  {#snippet headerActions()}
    <a class="org-button secondary" href="/purchase-lots"><ShoppingBag size={15} /> Add a purchase</a>
    <a class="org-button primary" href="/listing-prep"><ClipboardCheck size={15} /> Prep listings</a>
  {/snippet}

  <div class="org-stack">
    <section class="org-grid cols-4" aria-label="Business summary">
      <article class="org-card org-metric">
        <div class="org-metric-top"><span>Gross sales</span><CircleDollarSign size={17} /></div>
        <strong>{money(overview.grossCents)}</strong>
        <small>{counts.soldAll} tracked sale{counts.soldAll === 1 ? '' : 's'}</small>
      </article>

      <article class="org-card org-metric profit">
        <div class="org-metric-top">
          <span>{counts.soldMissingCogs ? 'Estimated profit' : 'Net profit'}</span>
          <TrendingUp size={17} />
        </div>
        <strong>{money(overview.profitCents)}</strong>
        <small>
          {counts.soldMissingCogs
            ? `${counts.soldMissingCogs} sale${counts.soldMissingCogs === 1 ? '' : 's'} still need purchase cost`
            : `${percent(overview.margin)} margin`}
        </small>
      </article>

      <article class="org-card org-metric">
        <div class="org-metric-top"><span>Invested in inventory</span><Boxes size={17} /></div>
        <strong>{money(overview.inventoryBasisCents)}</strong>
        <small>{counts.inventoryAll} unsold item{counts.inventoryAll === 1 ? '' : 's'}</small>
      </article>

      <article class="org-card org-metric">
        <div class="org-metric-top"><span>Active listings</span><ShoppingBag size={17} /></div>
        <strong>{counts.inventoryActive}</strong>
        <small>{money(overview.activeValueCents)} current asking value</small>
      </article>
    </section>

    <section class="org-grid home-main">
      <article class="org-card">
        <div class="org-card-head">
          <div><span class="org-kicker">NEXT UP</span><h2>{attention.length ? 'What needs your attention' : 'You’re caught up'}</h2></div>
          {#if attention.length}<span class="org-pill">{attentionCount} to review</span>{:else}<span class="org-pill good">All clear</span>{/if}
        </div>

        {#if attention.length}
          <div class="org-action-list">
            {#each attention as item}
              <a class="org-action-row" href={item.href}>
                <span class:bad={item.severity === 'bad'} class:warn={item.severity === 'warn'} class="org-action-dot">
                  {#if item.severity === 'bad'}<AlertTriangle size={14} />{:else}<Clock3 size={14} />{/if}
                </span>
                <span class="org-action-copy"><strong>{item.title}</strong><small>{item.detail}</small></span>
                <b>{item.count}</b><ChevronRight size={14} />
              </a>
            {/each}
          </div>
        {:else}
          <div class="org-empty"><Check size={22} /><strong>Nothing needs cleanup right now.</strong>Your inventory and sales data are in good shape.</div>
        {/if}
      </article>

      <article class="org-card">
        <div class="org-card-head">
          <div><span class="org-kicker">INVENTORY</span><h2>Where everything sits</h2></div>
          <a class="org-button ghost mini" href="/inventory">Open inventory <ChevronRight size={13} /></a>
        </div>

        <div class="org-state-grid">
          <a class="org-state-card" href="/inventory?status=unlisted"><span>Unlisted</span><strong>{counts.inventoryUnlisted}</strong><small>waiting to list</small></a>
          <a class="org-state-card" href="/inventory?status=scheduled"><span>Scheduled</span><strong>{counts.inventoryScheduled}</strong><small>queued on marketplace</small></a>
          <a class="org-state-card" href="/inventory?status=active"><span>Active</span><strong>{counts.inventoryActive}</strong><small>{money(overview.activeValueCents)} asking</small></a>
          <a class="org-state-card" href="/sold"><span>Sold</span><strong>{counts.soldAll}</strong><small>tracked sales</small></a>
        </div>

        <div class="org-card-head">
          <div>
            <span class="org-kicker">EBAY</span>
            <h3>{shell.ebayConnection?.displayName ?? 'eBay account'}</h3>
            <p>{shell.connected ? 'Connected and available for automatic syncing.' : 'Connect eBay to automate listings and sales data.'}</p>
          </div>
          <span class:good={shell.connected} class="org-pill">{shell.connected ? 'connected' : 'not connected'}</span>
        </div>
      </article>
    </section>

    <section class="org-card">
      <div class="org-card-head">
        <div><span class="org-kicker">RECENT SALES</span><h2>What sold</h2></div>
        <a class="org-button ghost mini" href="/sold">All sales <ChevronRight size={13} /></a>
      </div>

      {#if overview.recentSales.length}
        <div class="org-sale-list">
          {#each overview.recentSales as sale}
            <a class="org-sale-row" href={`/sold/${encodeURIComponent(sale.id)}`}>
              <span class="org-sale-row-main">
                {#if sale.imageUrl}<img src={sale.imageUrl} alt="" />{:else}<span class="org-item-thumb"></span>{/if}
                <span><strong>{sale.title}</strong><small>{shortDate(sale.soldAt)} · {sale.ebayOrderId}{sale.sku ? ` · ${sale.sku}` : ''}</small></span>
              </span>
              <span class="org-sale-money"><small>Gross</small><strong>{money(sale.salePriceCents + sale.shippingChargedCents)}</strong></span>
              <span class="org-sale-profit">
                <small>{sale.cogsCents == null ? 'Purchase cost needed' : `${percent(sale.margin)} margin`}</small>
                <strong>{sale.cogsCents == null ? '—' : money(sale.netProfitCents)}</strong>
              </span>
              <ChevronRight size={14} />
            </a>
          {/each}
        </div>
      {:else}
        <div class="org-empty"><PackageCheck size={22} /><strong>No sales yet.</strong>Sales will show here after marketplace sync or import.</div>
      {/if}
    </section>

    <section class="org-card pad">
      <div class="org-coverage">
        <ArrowUpRight size={14} />
        <strong>Data coverage</strong><span class="dot"></span>
        <span>Sales {overview.firstSaleAt ? `from ${shortDate(overview.firstSaleAt)}` : 'not available yet'}{overview.latestSaleAt ? ` through ${shortDate(overview.latestSaleAt)}` : ''}</span>
        <span class="dot"></span><span>eBay sync {shell.connected ? 'connected' : 'not connected'}</span>
      </div>
    </section>
  </div>
</PageChrome>
