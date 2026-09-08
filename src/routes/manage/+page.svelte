<script lang="ts">
  import { ChevronRight, ClipboardCheck, FileSpreadsheet, Layers3, PackageSearch, PlugZap, Settings, ShoppingBag, Tag, UserRound } from '@lucide/svelte';
  import PageChrome from '$lib/components/organized/PageChrome.svelte';
  import type { OrganizedDashboardData } from '$lib/server/organized-dashboard';

  let { data }: { data: OrganizedDashboardData } = $props();

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

  const tools = [
    { href: '/listing-prep', title: 'Listing Prep', detail: 'Move unlisted inventory through the pre-listing workflow while keeping SKU identity and COGS attached.', icon: ClipboardCheck },
    { href: '/purchase-lots', title: 'Purchase Lots', detail: 'Capture mixed buys and allocate exact cost across the individual inventory records created from the lot.', icon: ShoppingBag },
    { href: '/categories', title: 'Categories', detail: 'Manage inventory taxonomy and the default SKU prefixes used during intake.', icon: Tag },
    { href: '/marketplaces', title: 'Marketplaces', detail: 'See connected and future selling channels without mixing marketplace identity into inventory identity.', icon: Layers3 },
    { href: '/integrations/ebay', title: 'eBay Connection', detail: 'OAuth status, scopes, token health, API verification and connection controls.', icon: PlugZap },
    { href: '/import', title: 'Data & Imports', detail: 'Backfill, recovery and manual data tools. Live API sync remains the normal operating path.', icon: FileSpreadsheet },
    { href: '/cogs', title: 'COGS Desk', detail: 'Focused queue for sold items that still need purchase cost before profit and ROI can be final.', icon: PackageSearch },
    { href: '/account', title: 'Account & Security', detail: 'Manage your authenticated Sellquity account and workspace access.', icon: UserRound }
  ];
</script>

<svelte:head><title>Sellquity · Manage</title></svelte:head>

<PageChrome active="manage" eyebrow="MANAGE" title="Manage Sellquity" workspace={data.workspace} connected={data.connected} lastSyncedAt={data.lastSyncedAt} {counts}>
  <div class="org-stack">
    <section class="org-card pad">
      <span class="org-kicker">OPERATIONS DIRECTORY</span>
      <h2 style="margin:6px 0 7px;font-size:1.05rem">The boring stuff should be easy to find.</h2>
      <p style="margin:0;color:#66818f;font-size:.67rem;max-width:760px;line-height:1.55">Sellquity’s setup and utility tools live here instead of competing with the daily seller workflow. Inventory, sold items, money and insights stay focused on work you do repeatedly.</p>
    </section>

    <section class="org-manage-grid">
      {#each tools as tool}
        {@const Icon = tool.icon}
        <a class="org-card org-manage-card" href={tool.href}>
          <Icon size={20} />
          <strong>{tool.title}</strong>
          <p>{tool.detail}</p>
          <span>Open <ChevronRight size={12} /></span>
        </a>
      {/each}
    </section>

    <section class="org-grid cols-2">
      <article class="org-card">
        <div class="org-card-head"><div><span class="org-kicker">MARKETPLACE STATUS</span><h2>{data.ebayConnection?.displayName ?? 'eBay'}</h2><p>{data.connected ? 'Connected through OAuth and ready for automatic sync.' : 'No live eBay connection is available.'}</p></div><span class:good={data.connected} class="org-pill">{data.connected ? 'live' : 'offline'}</span></div>
      </article>
      <article class="org-card">
        <div class="org-card-head"><div><span class="org-kicker">WORKSPACE</span><h2>{data.workspace.name}</h2><p>{data.workspace.role} access · {data.workspace.plan} plan</p></div><Settings size={18} /></div>
      </article>
    </section>
  </div>
</PageChrome>
