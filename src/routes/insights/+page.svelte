<script lang="ts">
  import { AlertTriangle, ArrowUpRight, BarChart3, Boxes, MapPin, TrendingUp } from '@lucide/svelte';
  import PageChrome from '$lib/components/organized/PageChrome.svelte';
  import { money } from '$lib/money';
  import type { OrganizedDashboardData } from '$lib/server/organized-dashboard';

  let { data }: { data: OrganizedDashboardData } = $props();

  type Period = '30d' | '90d' | 'ytd' | 'all';
  let period = $state<Period>('90d');

  function startDate() {
    const now = new Date();
    if (period === 'all') return null;
    if (period === '30d') return new Date(now.getTime() - 30 * 86_400_000);
    if (period === '90d') return new Date(now.getTime() - 90 * 86_400_000);
    return new Date(now.getFullYear(), 0, 1);
  }

  function inPeriod(value: string) {
    const start = startDate();
    return !start || Date.parse(value) >= start.getTime();
  }

  const sales = $derived.by(() => data.sales.filter((sale) => inPeriod(sale.soldAt)));
  const inventoryById = $derived(new Map(data.inventory.map((item) => [item.id, item] as const)));
  const fullyCosted = $derived(sales.filter((sale) => sale.cogsCents != null));
  const missingCosts = $derived(sales.filter((sale) => sale.cogsCents == null));
  const gross = $derived(sales.reduce((sum, sale) => sum + sale.salePriceCents + sale.shippingChargedCents, 0));
  const profit = $derived(sales.reduce((sum, sale) => sum + sale.netProfitCents, 0));
  const avgProfit = $derived(fullyCosted.length ? fullyCosted.reduce((sum, sale) => sum + sale.netProfitCents, 0) / fullyCosted.length : 0);
  const totalCogs = $derived(fullyCosted.reduce((sum, sale) => sum + (sale.cogsCents ?? 0), 0));
  const roi = $derived(totalCogs ? (fullyCosted.reduce((sum, sale) => sum + sale.netProfitCents, 0) / totalCogs) * 100 : null);

  const active = $derived(data.inventory.filter((item) => item.status === 'active'));
  const unlisted = $derived(data.inventory.filter((item) => item.status === 'unlisted'));
  const unsold = $derived(data.inventory.filter((item) => item.status !== 'sold'));
  const missingInventory = $derived(unsold.filter((item) => item.costCents == null || !item.source?.trim() || !item.location?.trim()));
  const stale = $derived(active.filter((item) => item.ageDays >= 91));
  const staleCapital = $derived(stale.reduce((sum, item) => sum + (item.costCents ?? 0), 0));

  const counts = $derived({
    inventoryAll: data.inventory.length,
    inventoryUnlisted: unlisted.length,
    inventoryScheduled: data.inventory.filter((item) => item.status === 'scheduled').length,
    inventoryActive: active.length,
    inventoryMissing: missingInventory.length,
    soldAll: data.sales.length,
    soldMissingCogs: data.sales.filter((sale) => sale.cogsCents == null).length,
    soldUnmatched: data.sales.filter((sale) => !sale.inventoryItemId).length
  });

  type GroupRow = { key: string; sales: number; gross: number; cogs: number; profit: number; missing: number; margin: number; roi: number | null };

  function grouped(field: 'category' | 'source') {
    const groups = new Map<string, GroupRow>();
    for (const sale of sales) {
      const item = sale.inventoryItemId ? inventoryById.get(sale.inventoryItemId) : null;
      const key = field === 'category'
        ? (item?.category?.replace(/_/g, ' ') ?? 'Uncategorized')
        : (item?.source?.trim() || 'Source not set');
      let row = groups.get(key);
      if (!row) {
        row = { key, sales: 0, gross: 0, cogs: 0, profit: 0, missing: 0, margin: 0, roi: null };
        groups.set(key, row);
      }
      row.sales += 1;
      row.gross += sale.salePriceCents + sale.shippingChargedCents;
      row.profit += sale.netProfitCents;
      if (sale.cogsCents == null) row.missing += 1;
      else row.cogs += sale.cogsCents;
    }
    for (const row of groups.values()) {
      row.margin = row.gross ? (row.profit / row.gross) * 100 : 0;
      row.roi = row.missing === 0 && row.cogs > 0 ? (row.profit / row.cogs) * 100 : null;
    }
    return [...groups.values()].sort((a, b) => b.profit - a.profit);
  }

  const byCategory = $derived(grouped('category'));
  const bySource = $derived(grouped('source'));
  const bestSales = $derived.by(() => [...fullyCosted].sort((a, b) => b.netProfitCents - a.netProfitCents).slice(0, 5));
  const lowestSales = $derived.by(() => [...fullyCosted].sort((a, b) => a.netProfitCents - b.netProfitCents).slice(0, 5));

  const ageBuckets = $derived([
    { label: '0–30 days', count: active.filter((item) => item.ageDays <= 30).length, cost: active.filter((item) => item.ageDays <= 30).reduce((sum, item) => sum + (item.costCents ?? 0), 0) },
    { label: '31–60 days', count: active.filter((item) => item.ageDays >= 31 && item.ageDays <= 60).length, cost: active.filter((item) => item.ageDays >= 31 && item.ageDays <= 60).reduce((sum, item) => sum + (item.costCents ?? 0), 0) },
    { label: '61–90 days', count: active.filter((item) => item.ageDays >= 61 && item.ageDays <= 90).length, cost: active.filter((item) => item.ageDays >= 61 && item.ageDays <= 90).reduce((sum, item) => sum + (item.costCents ?? 0), 0) },
    { label: '91+ days', count: stale.length, cost: staleCapital }
  ]);

  function percent(value: number) { return `${value.toFixed(1)}%`; }
</script>

<svelte:head><title>Sellquity · Insights</title></svelte:head>

<PageChrome active="insights" eyebrow="INSIGHTS" title="Insights" workspace={data.workspace} connected={data.connected} lastSyncedAt={data.lastSyncedAt} {counts}>
  <div class="org-stack">
    <section class="org-card">
      <div class="org-toolbar">
        <div><span class="org-kicker">PERIOD</span><p style="margin:4px 0 0;color:#66818f;font-size:.67rem">Sales insights change with the period. Inventory age is always current.</p></div>
        <div class="org-segments">
          <button class:active={period === '30d'} type="button" onclick={() => period = '30d'}>30 days</button>
          <button class:active={period === '90d'} type="button" onclick={() => period = '90d'}>90 days</button>
          <button class:active={period === 'ytd'} type="button" onclick={() => period = 'ytd'}>YTD</button>
          <button class:active={period === 'all'} type="button" onclick={() => period = 'all'}>All time</button>
        </div>
      </div>
    </section>

    {#if missingCosts.length}
      <section class="org-card pad" style="border-color:#604d27;background:#17140d">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap">
          <div style="display:flex;align-items:flex-start;gap:10px"><AlertTriangle size={18} /><div><strong>{missingCosts.length} sale{missingCosts.length === 1 ? '' : 's'} need purchase cost</strong><p style="margin:5px 0 0;color:#8f846a;font-size:.68rem">Profit-based insights are estimates until those costs are added.</p></div></div>
          <a class="org-button secondary" href="/cogs">Add purchase costs</a>
        </div>
      </section>
    {/if}

    <section class="org-grid cols-4">
      <article class="org-card org-metric"><div class="org-metric-top"><span>Gross sales</span><BarChart3 size={16} /></div><strong>{money(gross)}</strong><small>{sales.length} sale{sales.length === 1 ? '' : 's'} in period</small></article>
      <article class="org-card org-metric profit"><div class="org-metric-top"><span>{missingCosts.length ? 'Estimated profit' : 'Net profit'}</span><TrendingUp size={16} /></div><strong>{money(profit)}</strong><small>{missingCosts.length ? 'some costs still missing' : 'fully costed'}</small></article>
      <article class="org-card org-metric"><div class="org-metric-top"><span>Avg profit / costed sale</span><ArrowUpRight size={16} /></div><strong>{money(avgProfit)}</strong><small>{fullyCosted.length} fully costed sale{fullyCosted.length === 1 ? '' : 's'}</small></article>
      <article class="org-card org-metric"><div class="org-metric-top"><span>Cash tied up 91+ days</span><Boxes size={16} /></div><strong>{money(staleCapital)}</strong><small>{stale.length} active listing{stale.length === 1 ? '' : 's'}</small></article>
    </section>

    <section class="org-grid cols-2">
      <article class="org-card">
        <div class="org-card-head"><div><span class="org-kicker">BY CATEGORY</span><h2>Where profit is coming from</h2><p>Sorted by tracked profit for the selected period.</p></div><Boxes size={18} /></div>
        {#if byCategory.length}<div class="org-ranking-list">{#each byCategory.slice(0, 8) as row}<div class="org-ranking-row"><span class="org-ranking-copy"><strong>{row.key}</strong><small>{row.sales} sale{row.sales === 1 ? '' : 's'}{row.missing ? ` · ${row.missing} missing cost` : ''}</small></span><span>{money(row.profit)}</span><span>{row.roi == null ? 'ROI —' : `${percent(row.roi)} ROI`}</span></div>{/each}</div>{:else}<div class="org-empty"><strong>No category performance yet.</strong>Linked sales will build this view.</div>{/if}
      </article>

      <article class="org-card">
        <div class="org-card-head"><div><span class="org-kicker">BY SOURCE</span><h2>Where profitable inventory comes from</h2><p>Compare the places you actually buy inventory.</p></div><MapPin size={18} /></div>
        {#if bySource.length}<div class="org-ranking-list">{#each bySource.slice(0, 8) as row}<div class="org-ranking-row"><span class="org-ranking-copy"><strong>{row.key}</strong><small>{row.sales} sale{row.sales === 1 ? '' : 's'}{row.missing ? ` · ${row.missing} missing cost` : ''}</small></span><span>{money(row.profit)}</span><span>{row.roi == null ? 'ROI —' : `${percent(row.roi)} ROI`}</span></div>{/each}</div>{:else}<div class="org-empty"><strong>No source performance yet.</strong>Add a purchase source when you intake inventory.</div>{/if}
      </article>
    </section>

    <section class="org-card">
      <div class="org-card-head"><div><span class="org-kicker">INVENTORY AGE</span><h2>Where your cash is sitting</h2><p>Older active inventory can be a signal to reprice, promote, bundle, or move on.</p></div><Boxes size={18} /></div>
      <div class="org-grid cols-4" style="padding:12px">{#each ageBuckets as bucket}<a class="org-card org-metric" href={bucket.label === '91+ days' ? '/inventory?age=stale' : '/inventory?status=active'}><div class="org-metric-top"><span>{bucket.label}</span><Boxes size={15} /></div><strong>{bucket.count}</strong><small>{money(bucket.cost)} purchase cost</small></a>{/each}</div>
    </section>

    <section class="org-grid cols-2">
      <article class="org-card">
        <div class="org-card-head"><div><span class="org-kicker">TOP PROFIT SALES</span><h2>Sales worth studying</h2></div><TrendingUp size={18} /></div>
        {#if bestSales.length}<div class="org-ranking-list">{#each bestSales as sale}<a class="org-ranking-row" href={`/sold/${encodeURIComponent(sale.id)}`}><span class="org-ranking-copy"><strong>{sale.title}</strong><small>{percent(sale.margin)} margin · {sale.roi == null ? 'ROI unavailable' : `${percent(sale.roi)} ROI`}</small></span><span class="org-positive">{money(sale.netProfitCents)}</span><span>{money(sale.salePriceCents + sale.shippingChargedCents)} gross</span></a>{/each}</div>{:else}<div class="org-empty"><strong>No fully costed sales in this period.</strong>Add purchase costs to unlock profit comparisons.</div>{/if}
      </article>

      <article class="org-card">
        <div class="org-card-head"><div><span class="org-kicker">LOWEST PROFIT SALES</span><h2>Sales to learn from</h2></div><TrendingUp size={18} /></div>
        {#if lowestSales.length}<div class="org-ranking-list">{#each lowestSales as sale}<a class="org-ranking-row" href={`/sold/${encodeURIComponent(sale.id)}`}><span class="org-ranking-copy"><strong>{sale.title}</strong><small>{percent(sale.margin)} margin · {sale.roi == null ? 'ROI unavailable' : `${percent(sale.roi)} ROI`}</small></span><span class:org-negative={sale.netProfitCents < 0}>{money(sale.netProfitCents)}</span><span>{money(sale.salePriceCents + sale.shippingChargedCents)} gross</span></a>{/each}</div>{:else}<div class="org-empty"><strong>No fully costed sales in this period.</strong>There is nothing to compare yet.</div>{/if}
      </article>
    </section>

    {#if roi != null}
      <section class="org-card pad"><span class="org-kicker">FULLY COSTED SALES ROI</span><h2 style="margin:6px 0 4px">{percent(roi)}</h2><p style="margin:0;color:#66818f;font-size:.67rem">Profit divided by known purchase cost for fully costed sales in this period.</p></section>
    {/if}
  </div>
</PageChrome>
