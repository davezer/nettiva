<script lang="ts">
  import type { Snippet } from 'svelte';
  import { page } from '$app/state';
  import {
    ChevronDown,
    ChevronRight,
    CircleDollarSign,
    ClipboardCheck,
    FileSpreadsheet,
    Layers3,
    PlugZap,
    ReceiptText,
    Settings,
    ShoppingBag,
    Tag,
    UserRound
  } from '@lucide/svelte';
  import type { OrganizedShellCounts } from '$lib/server/organized-dashboard';
  import type { WorkspaceSummary } from '$lib/types';
  import './organized.css';

  let {
    children,
    workspace,
    connected,
    lastSyncedAt = null,
    counts
  }: {
    children: Snippet;
    workspace: WorkspaceSummary;
    connected: boolean;
    lastSyncedAt?: string | null;
    counts: OrganizedShellCounts;
  } = $props();

  const groups = [
    {
      index: '02',
      label: 'Inventory',
      items: [
        { key: 'inventory-all', label: 'All inventory', href: '/inventory', count: 'inventoryAll' as const },
        { key: 'inventory-unlisted', label: 'Unlisted', href: '/inventory?status=unlisted', count: 'inventoryUnlisted' as const },
        { key: 'listing-prep', label: 'Listing Prep', href: '/listing-prep', icon: ClipboardCheck },
        { key: 'inventory-scheduled', label: 'Scheduled', href: '/inventory?status=scheduled', count: 'inventoryScheduled' as const },
        { key: 'inventory-active', label: 'Active', href: '/inventory?status=active', count: 'inventoryActive' as const },
        { key: 'inventory-missing', label: 'Missing data', href: '/inventory?quality=missing', count: 'inventoryMissing' as const }
      ]
    },
    {
      index: '03',
      label: 'Sold',
      items: [
        { key: 'sold-all', label: 'All sold', href: '/sold', count: 'soldAll' as const },
        { key: 'sold-missing-cogs', label: 'Missing COGS', href: '/sold?quality=missing-cogs', count: 'soldMissingCogs' as const },
        { key: 'sold-unmatched', label: 'Unmatched sales', href: '/sold?quality=unmatched', count: 'soldUnmatched' as const }
      ]
    },
    {
      index: '04',
      label: 'Money',
      items: [
        { key: 'money-overview', label: 'Overview', href: '/money' },
        { key: 'money-transactions', label: 'Transactions', href: '/money/transactions', icon: ReceiptText },
        { key: 'cogs', label: 'COGS Desk', href: '/cogs', icon: CircleDollarSign },
        { key: 'purchase-lots', label: 'Purchase Lots', href: '/purchase-lots', icon: ShoppingBag }
      ]
    },
    {
      index: '05',
      label: 'Insights',
      items: [
        { key: 'insights', label: 'Sales & inventory', href: '/insights' }
      ]
    },
    {
      index: '06',
      label: 'Manage',
      items: [
        { key: 'manage', label: 'Manage home', href: '/manage', icon: Settings },
        { key: 'categories', label: 'Categories', href: '/categories', icon: Tag },
        { key: 'marketplaces', label: 'Marketplaces', href: '/marketplaces', icon: Layers3 },
        { key: 'imports', label: 'Data & imports', href: '/import', icon: FileSpreadsheet },
        { key: 'ebay', label: 'eBay connection', href: '/integrations/ebay', icon: PlugZap }
      ]
    }
  ];

  function activeFromRoute() {
    const pathname = page.url.pathname;
    const params = page.url.searchParams;

    if (pathname === '/') return 'home';
    if (pathname.startsWith('/inventory')) {
      if (params.get('quality') === 'missing') return 'inventory-missing';
      if (params.get('status') === 'unlisted') return 'inventory-unlisted';
      if (params.get('status') === 'scheduled') return 'inventory-scheduled';
      if (params.get('status') === 'active') return 'inventory-active';
      return 'inventory-all';
    }
    if (pathname === '/listing-prep') return 'listing-prep';
    if (pathname.startsWith('/sold')) {
      if (params.get('quality') === 'missing-cogs') return 'sold-missing-cogs';
      if (params.get('quality') === 'unmatched') return 'sold-unmatched';
      return 'sold-all';
    }
    if (pathname.startsWith('/money/transactions')) return 'money-transactions';
    if (pathname.startsWith('/money')) return 'money-overview';
    if (pathname.startsWith('/cogs')) return 'cogs';
    if (pathname.startsWith('/purchase-lots')) return 'purchase-lots';
    if (pathname.startsWith('/insights')) return 'insights';
    if (pathname.startsWith('/manage')) return 'manage';
    if (pathname.startsWith('/categories')) return 'categories';
    if (pathname.startsWith('/marketplaces')) return 'marketplaces';
    if (pathname.startsWith('/import')) return 'imports';
    if (pathname.startsWith('/integrations/ebay')) return 'ebay';
    if (pathname.startsWith('/account')) return 'account';
    return '';
  }

  const active = $derived(activeFromRoute());

  function formatSyncedAt(value: string | null) {
    if (!value) return 'Never synced';
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return 'Never synced';
    return `Synced ${new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }).format(date)}`;
  }
</script>

<div class="organized-shell">
  <aside class="organized-sidebar">
    <a class="organized-brand" href="/" aria-label="Sellquity home" data-sveltekit-preload-data="hover">
      <span class="organized-brand-mark"><img src="/s-no-bg.png" alt="" /></span>
      <span><strong>SELLQUITY</strong><small>Reseller ledger</small></span>
    </a>

    <div class="organized-nav-caption">
      <span>WORKSPACE INDEX</span>
      <b>{workspace.name}</b>
    </div>

    <nav class="organized-nav" aria-label="Primary navigation" data-sveltekit-preload-data="hover">
      <a class:active={active === 'home'} class="organized-nav-home" href="/">
        <span class="organized-nav-index">01</span>
        <span>Home</span>
      </a>

      {#each groups as group}
        <details class="organized-nav-group" open>
          <summary>
            <span class="organized-nav-index">{group.index}</span>
            <span>{group.label}</span>
            <ChevronDown class="organized-chevron" size={15} />
          </summary>
          <div class="organized-nav-children">
            {#each group.items as item}
              {@const ItemIcon = 'icon' in item ? item.icon : null}
              <a class:active={active === item.key} href={item.href}>
                {#if ItemIcon}<ItemIcon size={14} />{/if}
                <span>{item.label}</span>
                {#if 'count' in item && item.count}
                  <b>{counts[item.count]}</b>
                {/if}
              </a>
            {/each}
          </div>
        </details>
      {/each}
    </nav>

    <div class="organized-sidebar-footer">
      <a href="/account" class:active={active === 'account'}>
        <UserRound size={17} />
        <span>
          <strong>{workspace.name}</strong>
          <small>{workspace.role} · {workspace.plan}</small>
        </span>
        <ChevronRight size={14} />
      </a>
      <div class:online={connected} class="organized-connection-line">
        <span></span>
        <small>{connected ? formatSyncedAt(lastSyncedAt) : 'eBay not connected'}</small>
      </div>
    </div>
  </aside>

  <main class="organized-main frame-only">
    {@render children()}
  </main>
</div>
