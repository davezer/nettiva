<script lang="ts">
  import {
    AlertTriangle,
    ArrowUpRight,
    Boxes,
    Check,
    ChevronRight,
    CircleDollarSign,
    Clock3,
    PackageCheck,
    ShoppingBag,
    TrendingUp
  } from '@lucide/svelte';
  import PageChrome from '$lib/components/organized/PageChrome.svelte';
  import type { OrganizedDashboardData } from '$lib/server/organized-dashboard';
  import { money, shortDate } from '$lib/money';

  let { data }: { data: OrganizedDashboardData } = $props();

  const inventory = $derived(data.inventory ?? []);
  const sales = $derived(data.sales ?? []);
  const unsold = $derived(inventory.filter((item) => item.status !== 'sold'));
  const active = $derived(inventory.filter((item) => item.status === 'active'));
  const scheduled = $derived(inventory.filter((item) => item.status === 'scheduled'));
  const unlisted = $derived(inventory.filter((item) => item.status === 'unlisted'));
  const stale = $derived(active.filter((item) => item.ageDays >= 91));

  const missingInventory = $derived(
    unsold.filter((item) =>
      item.costCents == null || !item.source?.trim() || !item.location?.trim()
    )
  );
  const missingCogs = $derived(sales.filter((sale) => sale.cogsCents == null));
  const unmatchedSales = $derived(sales.filter((sale) => !sale.inventoryItemId));

  const gross = $derived(
    sales.reduce((sum, sale) => sum + sale.salePriceCents + sale.shippingChargedCents, 0)
  );
  const cogs = $derived(sales.reduce((sum, sale) => sum + (sale.cogsCents ?? 0), 0));
  const pnlAdjustments = $derived(data.pnlAdjustmentsCents ?? 0);
  const profit = $derived(gross + pnlAdjustments - cogs);
  const margin = $derived(gross ? (profit / gross) * 100 : 0);
  const inventoryBasis = $derived(
    unsold.reduce((sum, item) => sum + (item.costCents ?? 0), 0)
  );
  const activeValue = $derived(active.reduce((sum, item) => sum + (item.listPriceCents ?? 0), 0));

  const qualityChecks = $derived([
    missingCogs.length === 0,
    unmatchedSales.length === 0,
    unsold.filter((item) => item.costCents == null).length === 0,
    unsold.filter((item) => !item.source?.trim()).length === 0,
    unsold.filter((item) => !item.location?.trim()).length === 0,
    data.connected && Boolean(data.lastSyncedAt)
  ]);
  const healthClear = $derived(qualityChecks.filter(Boolean).length);
  const healthScore = $derived(Math.round((healthClear / qualityChecks.length) * 100));

  const firstSaleAt = $derived(
    sales.length
      ? [...sales].sort((a, b) => Date.parse(a.soldAt) - Date.parse(b.soldAt))[0]?.soldAt ?? null
      : null
  );
  const latestSaleAt = $derived(sales[0]?.soldAt ?? null);

  const counts = $derived({
    inventoryAll: inventory.length,
    inventoryUnlisted: unlisted.length,
    inventoryScheduled: scheduled.length,
    inventoryActive: active.length,
    inventoryMissing: missingInventory.length,
    soldAll: sales.length,
    soldMissingCogs: missingCogs.length,
    soldUnmatched: unmatchedSales.length
  });

  const attention = $derived.by(() => {
    const rows: Array<{
      href: string;
      title: string;
      detail: string;
      count: number;
      severity: 'bad' | 'warn' | 'good';
    }> = [];

    if (missingCogs.length) rows.push({
      href: '/sold?quality=missing-cogs',
      title: 'Sold items missing COGS',
      detail: 'Finish purchase cost so profit and ROI become final.',
      count: missingCogs.length,
      severity: 'bad'
    });
    if (unmatchedSales.length) rows.push({
      href: '/sold?quality=unmatched',
      title: 'Sales not linked to inventory',
      detail: 'Review sales that could not attach to a tracked item.',
      count: unmatchedSales.length,
      severity: 'bad'
    });
    if (missingInventory.length) rows.push({
      href: '/inventory?quality=missing',
      title: 'Current inventory missing data',
      detail: 'Cost, source or storage location still needs attention.',
      count: missingInventory.length,
      severity: 'warn'
    });
    if (stale.length) rows.push({
      href: '/inventory?status=active&age=stale',
      title: 'Active listings at 91+ days',
      detail: 'Old inventory is tying up capital and deserves a pricing review.',
      count: stale.length,
      severity: 'warn'
    });

    return rows;
  });

  function percent(value: number) {
    return `${value.toFixed(1)}%`;
  }
</script>

<svelte:head>
  <title>Sellquity · Home</title>
</svelte:head>

<PageChrome
  active="home"
  eyebrow="SELLER COMMAND CENTER"
  title="Home"
  workspace={data.workspace}
  connected={data.connected}
  lastSyncedAt={data.lastSyncedAt}
  {counts}
>
  <div class="org-stack">
    <section class="org-grid cols-4" aria-label="Business summary">
      <article class="org-card org-metric">
        <div class="org-metric-top"><span>Gross sales</span><CircleDollarSign size={17} /></div>
        <strong>{money(gross)}</strong>
        <small>{sales.length} tracked sale{sales.length === 1 ? '' : 's'}</small>
      </article>
      <article class="org-card org-metric profit">
        <div class="org-metric-top"><span>{missingCogs.length ? 'Profit before missing COGS' : 'Net profit'}</span><TrendingUp size={17} /></div>
        <strong>{money(profit)}</strong>
        <small>{missingCogs.length ? `${missingCogs.length} sale cost${missingCogs.length === 1 ? '' : 's'} still needed` : `${percent(margin)} true margin`}</small>
      </article>
      <article class="org-card org-metric">
        <div class="org-metric-top"><span>Inventory invested</span><Boxes size={17} /></div>
        <strong>{money(inventoryBasis)}</strong>
        <small>{unsold.length} unsold item{unsold.length === 1 ? '' : 's'} carrying known COGS</small>
      </article>
      <article class="org-card org-metric">
        <div class="org-metric-top"><span>Active listings</span><ShoppingBag size={17} /></div>
        <strong>{active.length}</strong>
        <small>{money(activeValue)} current asking value</small>
      </article>
    </section>

    <section class="org-grid home-main">
      <article class="org-card">
        <div class="org-card-head">
          <div>
            <span class="org-kicker">ACTION CENTER</span>
            <h2>{attention.length ? 'What needs your attention' : 'You’re caught up'}</h2>
          </div>
          <div class="org-health-ring">
            <span>{healthScore}%</span>
            <div><strong>Data health</strong><small>{healthClear}/{qualityChecks.length} checks clear</small></div>
          </div>
        </div>

        {#if attention.length}
          <div class="org-action-list">
            {#each attention as item}
              <a class="org-action-row" href={item.href}>
                <span class:bad={item.severity === 'bad'} class:warn={item.severity === 'warn'} class="org-action-dot">
                  {#if item.severity === 'bad'}<AlertTriangle size={14} />{:else}<Clock3 size={14} />{/if}
                </span>
                <span class="org-action-copy"><strong>{item.title}</strong><small>{item.detail}</small></span>
                <b>{item.count}</b>
                <ChevronRight size={14} />
              </a>
            {/each}
          </div>
        {:else}
          <div class="org-empty"><Check size={22} /><strong>Nothing needs cleanup right now.</strong>Your inventory, sales and live marketplace data are in good shape.</div>
        {/if}
      </article>

      <article class="org-card">
        <div class="org-card-head">
          <div><span class="org-kicker">INVENTORY FLOW</span><h2>Where everything sits</h2></div>
          <a class="org-button ghost mini" href="/inventory">Open inventory <ChevronRight size={13} /></a>
        </div>
        <div class="org-state-grid">
          <a class="org-state-card" href="/inventory?status=unlisted"><span>Unlisted</span><strong>{unlisted.length}</strong><small>waiting to list</small></a>
          <a class="org-state-card" href="/inventory?status=scheduled"><span>Scheduled</span><strong>{scheduled.length}</strong><small>queued on marketplace</small></a>
          <a class="org-state-card" href="/inventory?status=active"><span>Active</span><strong>{active.length}</strong><small>{money(activeValue)} asking</small></a>
          <a class="org-state-card" href="/sold"><span>Sold</span><strong>{sales.length}</strong><small>tracked sales</small></a>
        </div>
        <div class="org-card-head">
          <div>
            <span class="org-kicker">LIVE DATA</span>
            <h3>{data.ebayConnection?.displayName ?? 'eBay'}</h3>
            <p>{data.connected ? 'OAuth connected · automatic API sync' : 'Connect eBay to automate inventory and financial data.'}</p>
          </div>
          <span class:good={data.connected} class="org-pill">{data.connected ? 'live' : 'offline'}</span>
        </div>
      </article>
    </section>

    <section class="org-card">
      <div class="org-card-head">
        <div><span class="org-kicker">RECENT SALES</span><h2>What sold</h2></div>
        <a class="org-button ghost mini" href="/sold">All sold <ChevronRight size={13} /></a>
      </div>
      {#if sales.length}
        <div class="org-sale-list">
          {#each sales.slice(0, 7) as sale}
            {@const item = inventory.find((candidate) => candidate.id === sale.inventoryItemId)}
            <a class="org-sale-row" href={`/sold/${encodeURIComponent(sale.id)}`}>
              <span class="org-sale-row-main">
                {#if item?.imageUrl}<img src={item.imageUrl} alt="" />{:else}<span class="org-item-thumb"></span>{/if}
                <span><strong>{sale.title}</strong><small>{shortDate(sale.soldAt)} · {sale.ebayOrderId}</small></span>
              </span>
              <span class="org-sale-money"><small>Gross</small><strong>{money(sale.salePriceCents + sale.shippingChargedCents)}</strong></span>
              <span class="org-sale-profit"><small>{sale.cogsCents == null ? 'COGS missing' : `${percent(sale.margin)} margin`}</small><strong>{money(sale.netProfitCents)}</strong></span>
              <ChevronRight size={14} />
            </a>
          {/each}
        </div>
      {:else}
        <div class="org-empty"><PackageCheck size={22} /><strong>No sales yet.</strong>Sales will land here automatically after marketplace sync.</div>
      {/if}
    </section>

    <section class="org-card pad">
      <div class="org-coverage">
        <ArrowUpRight size={14} />
        <strong>Sellquity data coverage</strong>
        <span class="dot"></span>
        <span>Sales {firstSaleAt ? `from ${shortDate(firstSaleAt)}` : 'not available yet'}{latestSaleAt ? ` through ${shortDate(latestSaleAt)}` : ''}</span>
        <span class="dot"></span>
        <span>Live API sync {data.connected ? 'connected' : 'not connected'}</span>
      </div>
    </section>
  </div>
</PageChrome>
