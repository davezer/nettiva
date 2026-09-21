<script lang="ts">
  import { AlertTriangle, ArrowUpRight, BarChart3, Boxes, MapPin, TrendingUp } from '@lucide/svelte';
  import PageChrome from '$lib/components/organized/PageChrome.svelte';
  import { money } from '$lib/money';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const shell = $derived(data.shell);
  const report = $derived(data.report);
  const counts = $derived(shell.counts);
  const stale = $derived(report.ageBuckets[3]);

  function percent(value: number) { return `${value.toFixed(1)}%`; }
</script>

<svelte:head><title>Sellquity · Insights</title></svelte:head>

<PageChrome active="insights" eyebrow="INSIGHTS" title="Insights" workspace={shell.workspace} connected={shell.connected} lastSyncedAt={shell.lastSyncedAt} {counts}>
  <div class="org-stack">
    <section class="org-card">
      <div class="org-toolbar">
        <div><span class="org-kicker">PERIOD</span><p style="margin:4px 0 0;color:#66818f;font-size:.67rem">Sales insights use full database totals. Inventory age is always current.</p></div>
        <div class="org-segments">
          <a class:active={report.period === '30d'} href="/insights?period=30d">30 days</a>
          <a class:active={report.period === '90d'} href="/insights?period=90d">90 days</a>
          <a class:active={report.period === 'ytd'} href="/insights?period=ytd">YTD</a>
          <a class:active={report.period === 'all'} href="/insights?period=all">All time</a>
        </div>
      </div>
    </section>

    {#if report.summary.missingCosts}
      <section class="org-card pad" style="border-color:#604d27;background:#17140d">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap">
          <div style="display:flex;align-items:flex-start;gap:10px"><AlertTriangle size={18} /><div><strong>{report.summary.missingCosts} sale{report.summary.missingCosts === 1 ? '' : 's'} need purchase cost</strong><p style="margin:5px 0 0;color:#8f846a;font-size:.68rem">Profit-based insights are estimates until those costs are added.</p></div></div>
          <a class="org-button secondary" href="/cogs">Add purchase costs</a>
        </div>
      </section>
    {/if}

    <section class="org-grid cols-4">
      <article class="org-card org-metric"><div class="org-metric-top"><span>Gross sales</span><BarChart3 size={16} /></div><strong>{money(report.summary.grossCents)}</strong><small>{report.summary.sales} sale{report.summary.sales === 1 ? '' : 's'} in period</small></article>
      <article class="org-card org-metric profit"><div class="org-metric-top"><span>{report.summary.missingCosts ? 'Estimated profit' : 'Net profit'}</span><TrendingUp size={16} /></div><strong>{money(report.summary.profitCents)}</strong><small>{report.summary.missingCosts ? 'some costs still missing' : 'fully costed'}</small></article>
      <article class="org-card org-metric"><div class="org-metric-top"><span>Avg profit / costed sale</span><ArrowUpRight size={16} /></div><strong>{money(report.summary.avgProfitCents)}</strong><small>{report.summary.fullyCostedSales} fully costed sale{report.summary.fullyCostedSales === 1 ? '' : 's'}</small></article>
      <article class="org-card org-metric"><div class="org-metric-top"><span>Cash tied up 91+ days</span><Boxes size={16} /></div><strong>{money(stale?.costCents ?? 0)}</strong><small>{stale?.count ?? 0} active listing{stale?.count === 1 ? '' : 's'}</small></article>
    </section>

    <section class="org-grid cols-2">
      <article class="org-card">
        <div class="org-card-head"><div><span class="org-kicker">BY CATEGORY</span><h2>Where profit is coming from</h2><p>Sorted by tracked profit for the selected period.</p></div><Boxes size={18} /></div>
        {#if report.byCategory.length}<div class="org-ranking-list">{#each report.byCategory as row}<div class="org-ranking-row"><span class="org-ranking-copy"><strong>{row.key}</strong><small>{row.sales} sale{row.sales === 1 ? '' : 's'}{row.missingCosts ? ` · ${row.missingCosts} missing cost` : ''}</small></span><span>{money(row.profitCents)}</span><span>{row.roi == null ? 'ROI —' : `${percent(row.roi)} ROI`}</span></div>{/each}</div>{:else}<div class="org-empty"><strong>No category performance yet.</strong>Linked sales will build this view.</div>{/if}
      </article>

      <article class="org-card">
        <div class="org-card-head"><div><span class="org-kicker">BY SOURCE</span><h2>Where profitable inventory comes from</h2><p>Compare the places you actually buy inventory.</p></div><MapPin size={18} /></div>
        {#if report.bySource.length}<div class="org-ranking-list">{#each report.bySource as row}<div class="org-ranking-row"><span class="org-ranking-copy"><strong>{row.key}</strong><small>{row.sales} sale{row.sales === 1 ? '' : 's'}{row.missingCosts ? ` · ${row.missingCosts} missing cost` : ''}</small></span><span>{money(row.profitCents)}</span><span>{row.roi == null ? 'ROI —' : `${percent(row.roi)} ROI`}</span></div>{/each}</div>{:else}<div class="org-empty"><strong>No source performance yet.</strong>Add a purchase source when you intake inventory.</div>{/if}
      </article>
    </section>

    <section class="org-card">
      <div class="org-card-head"><div><span class="org-kicker">INVENTORY AGE</span><h2>Where your cash is sitting</h2><p>Older active inventory can be a signal to reprice, promote, bundle, or move on.</p></div><Boxes size={18} /></div>
      <div class="org-grid cols-4" style="padding:12px">{#each report.ageBuckets as bucket}<a class="org-card org-metric" href={bucket.label === '91+ days' ? '/inventory?status=active&age=stale' : '/inventory?status=active'}><div class="org-metric-top"><span>{bucket.label}</span><Boxes size={15} /></div><strong>{bucket.count}</strong><small>{money(bucket.costCents)} purchase cost</small></a>{/each}</div>
    </section>

    <section class="org-grid cols-2">
      <article class="org-card">
        <div class="org-card-head"><div><span class="org-kicker">TOP PROFIT SALES</span><h2>Sales worth studying</h2></div><TrendingUp size={18} /></div>
        {#if report.bestSales.length}<div class="org-ranking-list">{#each report.bestSales as sale}<a class="org-ranking-row" href={`/sold/${encodeURIComponent(sale.id)}`}><span class="org-ranking-copy"><strong>{sale.title}</strong><small>{percent(sale.margin)} margin · {sale.roi == null ? 'ROI unavailable' : `${percent(sale.roi)} ROI`}</small></span><span class="org-positive">{money(sale.netProfitCents)}</span><span>{money(sale.salePriceCents + sale.shippingChargedCents)} gross</span></a>{/each}</div>{:else}<div class="org-empty"><strong>No fully costed sales in this period.</strong>Add purchase costs to unlock profit comparisons.</div>{/if}
      </article>

      <article class="org-card">
        <div class="org-card-head"><div><span class="org-kicker">LOWEST PROFIT SALES</span><h2>Sales to learn from</h2></div><TrendingUp size={18} /></div>
        {#if report.lowestSales.length}<div class="org-ranking-list">{#each report.lowestSales as sale}<a class="org-ranking-row" href={`/sold/${encodeURIComponent(sale.id)}`}><span class="org-ranking-copy"><strong>{sale.title}</strong><small>{percent(sale.margin)} margin · {sale.roi == null ? 'ROI unavailable' : `${percent(sale.roi)} ROI`}</small></span><span class:org-negative={sale.netProfitCents < 0}>{money(sale.netProfitCents)}</span><span>{money(sale.salePriceCents + sale.shippingChargedCents)} gross</span></a>{/each}</div>{:else}<div class="org-empty"><strong>No fully costed sales in this period.</strong>There is nothing to compare yet.</div>{/if}
      </article>
    </section>

    {#if report.summary.roi != null}
      <section class="org-card pad"><span class="org-kicker">FULLY COSTED SALES ROI</span><h2 style="margin:6px 0 4px">{percent(report.summary.roi)}</h2><p style="margin:0;color:#66818f;font-size:.67rem">Profit divided by known purchase cost for fully costed sales in this period.</p></section>
    {/if}
  </div>
</PageChrome>
