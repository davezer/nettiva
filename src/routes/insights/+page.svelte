<script lang="ts">
  import { ArrowUpRight, BarChart3, Boxes, MapPin, TrendingUp } from '@lucide/svelte';
  import PageChrome from '$lib/components/organized/PageChrome.svelte';
  import { money } from '$lib/money';
  import type { OrganizedDashboardData } from '$lib/server/organized-dashboard';

  let { data }: { data: OrganizedDashboardData } = $props();

  const inventoryById = $derived(new Map(data.inventory.map((item) => [item.id, item] as const)));
  const fullyCosted = $derived(data.sales.filter((sale) => sale.cogsCents != null));
  const gross = $derived(data.sales.reduce((sum, sale) => sum + sale.salePriceCents + sale.shippingChargedCents, 0));
  const profit = $derived(data.sales.reduce((sum, sale) => sum + sale.netProfitCents, 0));
  const avgProfit = $derived(fullyCosted.length ? fullyCosted.reduce((sum, sale) => sum + sale.netProfitCents, 0) / fullyCosted.length : 0);
  const totalCogs = $derived(fullyCosted.reduce((sum, sale) => sum + (sale.cogsCents ?? 0), 0));
  const roi = $derived(totalCogs ? (fullyCosted.reduce((sum, sale) => sum + sale.netProfitCents, 0) / totalCogs) * 100 : null);

  const active = $derived(data.inventory.filter((item) => item.status === 'active'));
  const unlisted = $derived(data.inventory.filter((item) => item.status === 'unlisted'));
  const unsold = $derived(data.inventory.filter((item) => item.status !== 'sold'));
  const missingInventory = $derived(unsold.filter((item) => item.costCents == null || !item.source?.trim() || !item.location?.trim()));

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
    for (const sale of data.sales) {
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

  const winners = $derived.by(() => [...fullyCosted].sort((a, b) => b.netProfitCents - a.netProfitCents).slice(0, 5));
  const losers = $derived.by(() => [...fullyCosted].sort((a, b) => a.netProfitCents - b.netProfitCents).slice(0, 5));

  const ageBuckets = $derived([
    { label: '0–30 days', count: active.filter((item) => item.ageDays <= 30).length, cogs: active.filter((item) => item.ageDays <= 30).reduce((sum, item) => sum + (item.costCents ?? 0), 0) },
    { label: '31–60 days', count: active.filter((item) => item.ageDays >= 31 && item.ageDays <= 60).length, cogs: active.filter((item) => item.ageDays >= 31 && item.ageDays <= 60).reduce((sum, item) => sum + (item.costCents ?? 0), 0) },
    { label: '61–90 days', count: active.filter((item) => item.ageDays >= 61 && item.ageDays <= 90).length, cogs: active.filter((item) => item.ageDays >= 61 && item.ageDays <= 90).reduce((sum, item) => sum + (item.costCents ?? 0), 0) },
    { label: '91+ days', count: active.filter((item) => item.ageDays >= 91).length, cogs: active.filter((item) => item.ageDays >= 91).reduce((sum, item) => sum + (item.costCents ?? 0), 0) }
  ]);

  function percent(value: number) { return `${value.toFixed(1)}%`; }
</script>

<svelte:head><title>Sellquity · Insights</title></svelte:head>

<PageChrome active="insights" eyebrow="INSIGHTS" title="Sales & inventory" workspace={data.workspace} connected={data.connected} lastSyncedAt={data.lastSyncedAt} {counts}>
  <div class="org-stack">
    <section class="org-grid cols-4">
      <article class="org-card org-metric"><div class="org-metric-top"><span>Gross sales</span><BarChart3 size={16} /></div><strong>{money(gross)}</strong><small>{data.sales.length} sales analyzed</small></article>
      <article class="org-card org-metric profit"><div class="org-metric-top"><span>Tracked profit</span><TrendingUp size={16} /></div><strong>{money(profit)}</strong><small>{data.sales.filter((sale) => sale.cogsCents == null).length ? 'some COGS still missing' : 'fully costed'}</small></article>
      <article class="org-card org-metric"><div class="org-metric-top"><span>Avg costed sale profit</span><ArrowUpRight size={16} /></div><strong>{money(avgProfit)}</strong><small>{fullyCosted.length} costed sales</small></article>
      <article class="org-card org-metric"><div class="org-metric-top"><span>Costed-sale ROI</span><ArrowUpRight size={16} /></div><strong>{roi == null ? '—' : percent(roi)}</strong><small>profit ÷ known COGS</small></article>
    </section>

    <section class="org-grid cols-2">
      <article class="org-card">
        <div class="org-card-head"><div><span class="org-kicker">BY CATEGORY</span><h2>What actually makes money</h2></div><Boxes size={18} /></div>
        {#if byCategory.length}<div class="org-ranking-list">{#each byCategory.slice(0, 8) as row, index}<div class="org-ranking-row"><b>#{index + 1}</b><span class="org-ranking-copy"><strong>{row.key}</strong><small>{row.sales} sales{row.missing ? ` · ${row.missing} missing COGS` : ''}</small></span><span>{money(row.profit)}</span><span>{row.roi == null ? '—' : percent(row.roi)} ROI</span></div>{/each}</div>{:else}<div class="org-empty"><strong>No category performance yet.</strong>Sales linked to inventory will build this ranking.</div>{/if}
      </article>

      <article class="org-card">
        <div class="org-card-head"><div><span class="org-kicker">BY SOURCE</span><h2>Where the good inventory comes from</h2></div><MapPin size={18} /></div>
        {#if bySource.length}<div class="org-ranking-list">{#each bySource.slice(0, 8) as row, index}<div class="org-ranking-row"><b>#{index + 1}</b><span class="org-ranking-copy"><strong>{row.key}</strong><small>{row.sales} sales{row.missing ? ` · ${row.missing} missing COGS` : ''}</small></span><span>{money(row.profit)}</span><span>{row.roi == null ? '—' : percent(row.roi)} ROI</span></div>{/each}</div>{:else}<div class="org-empty"><strong>No source performance yet.</strong>Add sourcing history to inventory and Purchase Lots.</div>{/if}
      </article>
    </section>

    <section class="org-grid cols-2">
      <article class="org-card">
        <div class="org-card-head"><div><span class="org-kicker">WINNERS</span><h2>Sales worth remembering</h2></div><TrendingUp size={18} /></div>
        {#if winners.length}<div class="org-ranking-list">{#each winners as sale, index}<a class="org-ranking-row" href={`/sold/${encodeURIComponent(sale.id)}`}><b>#{index + 1}</b><span class="org-ranking-copy"><strong>{sale.title}</strong><small>{percent(sale.margin)} margin · {sale.roi == null ? 'ROI unavailable' : `${percent(sale.roi)} ROI`}</small></span><span class="org-positive">{money(sale.netProfitCents)}</span><span>{money(sale.salePriceCents + sale.shippingChargedCents)} gross</span></a>{/each}</div>{:else}<div class="org-empty"><strong>No fully costed sales yet.</strong>Add COGS to start ranking winners.</div>{/if}
      </article>

      <article class="org-card">
        <div class="org-card-head"><div><span class="org-kicker">LOWEST RETURN</span><h2>The stuff to learn from</h2></div><TrendingUp size={18} /></div>
        {#if losers.length}<div class="org-ranking-list">{#each losers as sale, index}<a class="org-ranking-row" href={`/sold/${encodeURIComponent(sale.id)}`}><b>#{index + 1}</b><span class="org-ranking-copy"><strong>{sale.title}</strong><small>{percent(sale.margin)} margin · {sale.roi == null ? 'ROI unavailable' : `${percent(sale.roi)} ROI`}</small></span><span class:org-negative={sale.netProfitCents < 0}>{money(sale.netProfitCents)}</span><span>{money(sale.salePriceCents + sale.shippingChargedCents)} gross</span></a>{/each}</div>{:else}<div class="org-empty"><strong>No fully costed sales yet.</strong>There is nothing to rank yet.</div>{/if}
      </article>
    </section>

    <section class="org-card">
      <div class="org-card-head"><div><span class="org-kicker">INVENTORY AGE</span><h2>Where capital is getting stuck</h2></div><Boxes size={18} /></div>
      <div class="org-grid cols-4" style="padding:12px">{#each ageBuckets as bucket}<article class="org-card org-metric"><div class="org-metric-top"><span>{bucket.label}</span><Boxes size={15} /></div><strong>{bucket.count}</strong><small>{money(bucket.cogs)} known COGS</small></article>{/each}</div>
    </section>
  </div>
</PageChrome>
