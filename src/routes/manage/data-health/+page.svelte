<script lang="ts">
  import { AlertTriangle, Check, ChevronRight, ShieldCheck } from '@lucide/svelte';
  import PageChrome from '$lib/components/organized/PageChrome.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const shell = $derived(data.shell);
  const report = $derived(data.report);
  const counts = $derived(shell.counts);

  const checks = $derived([
    { label: 'Listings with missing inventory', value: report.structural.orphanListings },
    { label: 'Listings linked across workspaces', value: report.structural.crossWorkspaceListings },
    { label: 'Sales with missing orders', value: report.structural.orphanOrderItems },
    { label: 'Sales linked to orders in another workspace', value: report.structural.crossWorkspaceOrders },
    { label: 'Sales linked to inventory in another workspace', value: report.structural.crossWorkspaceInventoryLinks },
    { label: 'Inventory linked to purchases in another workspace', value: report.structural.crossWorkspacePurchaseLots },
    { label: 'SKU reservations linked across workspaces', value: report.structural.crossWorkspaceSkuReservations },
    { label: 'Duplicate inventory SKUs', value: report.structural.duplicateSkus }
  ]);

  function checkedAt(value: string) {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime())
      ? parsed.toLocaleString()
      : value;
  }
</script>

<svelte:head><title>Data health · Sellquity</title></svelte:head>

<PageChrome active="manage" eyebrow="SETTINGS · DATA" title="Data health" workspace={shell.workspace} connected={shell.connected} lastSyncedAt={shell.lastSyncedAt} {counts}>
  {#snippet headerActions()}
    <a class="org-button secondary" href="/manage/data-health">Run checks again</a>
  {/snippet}

  <div class="org-stack">
    <section class:good={report.structuralIssues === 0} class:bad={report.structuralIssues > 0} class="health-hero org-card">
      <span class="health-icon">
        {#if report.structuralIssues === 0}<ShieldCheck size={24} />{:else}<AlertTriangle size={24} />{/if}
      </span>
      <div>
        <span class="org-kicker">DATABASE INTEGRITY</span>
        <h2>{report.structuralIssues === 0 ? 'Structural checks passed' : `${report.structuralIssues} structural issue${report.structuralIssues === 1 ? '' : 's'} found`}</h2>
        <p>
          {report.structuralIssues === 0
            ? 'Sellquity found no broken ownership links, cross-workspace references, or duplicate inventory SKUs in this workspace.'
            : 'These are database-level issues rather than normal cleanup work. Do not ignore them before onboarding more users.'}
        </p>
        <small>Checked {checkedAt(report.checkedAt)}</small>
      </div>
    </section>

    <section class="org-card">
      <div class="org-card-head">
        <div><span class="org-kicker">STRUCTURAL CHECKS</span><h2>Things that should always be zero</h2><p>Pass 5 also adds database guards that prevent new cross-workspace links from being written.</p></div>
      </div>
      <div class="check-list">
        {#each checks as item}
          <div class:problem={item.value > 0} class="check-row">
            <span>{#if item.value > 0}<AlertTriangle size={15} />{:else}<Check size={15} />{/if}</span>
            <strong>{item.label}</strong>
            <b>{item.value}</b>
          </div>
        {/each}
      </div>
    </section>

    <section class="org-card">
      <div class="org-card-head">
        <div><span class="org-kicker">NORMAL CLEANUP</span><h2>Seller data that still needs attention</h2><p>These are not database corruption. They are normal workflow queues Sellquity can help you finish.</p></div>
      </div>
      <div class="cleanup-grid">
        <a href="/cogs">
          <span><strong>Sales needing purchase cost</strong><small>Required before final profit is known.</small></span>
          <b>{report.cleanup.missingSaleCosts}</b><ChevronRight size={14} />
        </a>
        <a href="/sold?quality=unmatched">
          <span><strong>Unmatched sales</strong><small>Sales not linked to an inventory item yet.</small></span>
          <b>{report.cleanup.unmatchedSales}</b><ChevronRight size={14} />
        </a>
      </div>
    </section>

    <section class="org-card pad note">
      <strong>What this page does not do</strong>
      <p>It does not change or repair data automatically. Structural failures are surfaced so they can be investigated without a “fix” quietly rewriting accounting history.</p>
    </section>
  </div>
</PageChrome>

<style>
  .health-hero { display:flex; align-items:flex-start; gap:14px; padding:20px; border-color:#31536a; }
  .health-hero.good { border-color:#31563b; background:#0d1b14; }
  .health-hero.bad { border-color:#65333a; background:#1c1115; }
  .health-icon { width:43px; height:43px; flex:none; display:grid; place-items:center; border-radius:11px; color:#8bd49b; background:#14251a; }
  .health-hero.bad .health-icon { color:#ff9aa2; background:#2c171c; }
  .health-hero h2 { margin:5px 0 6px; font-size:1.08rem; }
  .health-hero p, .health-hero small, .note p { margin:0; color:#718a99; font-size:.68rem; line-height:1.55; }
  .health-hero small { display:block; margin-top:8px; font-size:.61rem; }
  .check-list { display:grid; }
  .check-row { display:grid; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; gap:10px; padding:12px 14px; border-top:1px solid #1b3140; color:#8299a8; }
  .check-row > span { color:#73d39a; }
  .check-row strong { color:#cdd9df; font-size:.7rem; }
  .check-row b { min-width:24px; text-align:right; color:#93a8b5; }
  .check-row.problem > span, .check-row.problem b { color:#f2939c; }
  .cleanup-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; padding:12px; }
  .cleanup-grid a { display:grid; grid-template-columns:minmax(0,1fr) auto auto; align-items:center; gap:10px; border:1px solid #294354; border-radius:11px; padding:14px; color:#d6e1e7; background:#0b1720; text-decoration:none; }
  .cleanup-grid a:hover { border-color:#3b6d83; }
  .cleanup-grid span { display:flex; flex-direction:column; gap:3px; }
  .cleanup-grid strong { font-size:.72rem; }
  .cleanup-grid small { color:#6d8595; font-size:.62rem; line-height:1.4; }
  .cleanup-grid b { font-size:1rem; }
  .note { border-style:dashed; }
  .note p { margin-top:5px; }
  @media (max-width:720px) { .cleanup-grid { grid-template-columns:1fr; } }
</style>
