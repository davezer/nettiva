<script lang="ts">
  import type { Snippet } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import {
    BadgeDollarSign,
    BarChart3,
    Boxes,
    ChevronDown,
    ChevronRight,
    CircleDollarSign,
    ClipboardCheck,
    FileSpreadsheet,
    Home,
    Layers3,
    LoaderCircle,
    PackageCheck,
    PlugZap,
    ReceiptText,
    RefreshCw,
    Settings,
    ShieldCheck,
    ShoppingBag,
    Tag,
    UserRound,
    WalletCards
  } from '@lucide/svelte';
  import type { WorkspaceSummary } from '$lib/types';
  import './organized.css';

  type CountKey =
    | 'inventoryAll'
    | 'inventoryUnlisted'
    | 'inventoryScheduled'
    | 'inventoryActive'
    | 'inventoryMissing'
    | 'soldAll'
    | 'soldMissingCogs'
    | 'soldUnmatched';

  type Counts = Partial<Record<CountKey, number>>;

  let {
    children,
    active,
    eyebrow,
    title,
    workspace,
    connected,
    lastSyncedAt = null,
    counts = {},
    headerActions
  }: {
    children: Snippet;
    active: string;
    eyebrow: string;
    title: string;
    workspace: WorkspaceSummary;
    connected: boolean;
    lastSyncedAt?: string | null;
    counts?: Counts;
    headerActions?: Snippet;
  } = $props();

  let syncing = $state(false);
  let syncMessage = $state<string | null>(null);
  let syncError = $state(false);

  const groups = [
    {
      key: 'inventory',
      label: 'Inventory',
      icon: Boxes,
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
      key: 'sold',
      label: 'Sold',
      icon: PackageCheck,
      items: [
        { key: 'sold-all', label: 'All sold', href: '/sold', count: 'soldAll' as const },
        { key: 'sold-missing-cogs', label: 'Missing COGS', href: '/sold?quality=missing-cogs', count: 'soldMissingCogs' as const },
        { key: 'sold-unmatched', label: 'Unmatched sales', href: '/sold?quality=unmatched', count: 'soldUnmatched' as const }
      ]
    },
    {
      key: 'money',
      label: 'Money',
      icon: WalletCards,
      items: [
        { key: 'money-overview', label: 'Overview', href: '/money' },
        { key: 'money-transactions', label: 'Transactions', href: '/money/transactions', icon: ReceiptText },
        { key: 'cogs', label: 'COGS Desk', href: '/cogs', icon: CircleDollarSign },
        { key: 'purchase-lots', label: 'Purchase Lots', href: '/purchase-lots', icon: ShoppingBag }
      ]
    },
    {
      key: 'insights',
      label: 'Insights',
      icon: BarChart3,
      items: [
        { key: 'insights', label: 'Sales & inventory', href: '/insights' }
      ]
    },
    {
      key: 'manage',
      label: 'Manage',
      icon: Settings,
      items: [
        { key: 'manage', label: 'Manage home', href: '/manage', icon: Settings },
        { key: 'categories', label: 'Categories', href: '/categories', icon: Tag },
        { key: 'marketplaces', label: 'Marketplaces', href: '/marketplaces', icon: Layers3 },
        { key: 'imports', label: 'Data & imports', href: '/import', icon: FileSpreadsheet },
        { key: 'ebay', label: 'eBay connection', href: '/integrations/ebay', icon: PlugZap }
      ]
    }
  ];

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

  async function syncNow() {
    if (!connected || syncing) return;
    syncing = true;
    syncMessage = null;
    syncError = false;

    try {
      const response = await fetch('/api/ebay/sync', { method: 'POST' });
      const result = await response.json().catch(() => null) as {
        error?: string;
        listings?: number;
        scheduled?: number;
        orders?: number;
        transactions?: number;
        historical?: boolean;
        historySeeded?: boolean;
      } | null;

      if (!response.ok) {
        syncError = true;
        syncMessage = result?.error ?? 'eBay sync failed.';
        return;
      }

      const pieces = [
        result?.listings != null ? `${result.listings} active` : null,
        result?.scheduled != null ? `${result.scheduled} scheduled` : null,
        result?.orders != null ? `${result.orders} orders` : null,
        result?.transactions != null ? `${result.transactions} finance rows` : null
      ].filter(Boolean);

      syncMessage = pieces.length ? `Live sync complete — ${pieces.join(', ')}.` : 'Live eBay sync complete.';
      await invalidateAll();
    } catch {
      syncError = true;
      syncMessage = 'Sellquity could not reach the eBay sync endpoint.';
    } finally {
      syncing = false;
    }
  }
</script>

<div class="organized-shell">
  <aside class="organized-sidebar">
    <a class="organized-brand" href="/" aria-label="Sellquity home">
      <span class="organized-brand-mark"><img src="/s-no-bg.png" alt="" /></span>
      <span><strong>SELLQUITY</strong><small>Resale intelligence</small></span>
    </a>

    <nav class="organized-nav" aria-label="Primary navigation">
      <a class:active={active === 'home'} class="organized-nav-home" href="/">
        <Home size={18} />
        <span>Home</span>
      </a>

      {#each groups as group}
        {@const GroupIcon = group.icon}
        <details class="organized-nav-group" open>
          <summary>
            <GroupIcon size={18} />
            <span>{group.label}</span>
            <ChevronDown class="organized-chevron" size={15} />
          </summary>
          <div class="organized-nav-children">
            {#each group.items as item}
              {@const ItemIcon = 'icon' in item ? item.icon : null}
              <a class:active={active === item.key} href={item.href}>
                {#if ItemIcon}<ItemIcon size={14} />{/if}
                <span>{item.label}</span>
                {#if 'count' in item && item.count && counts[item.count] != null}
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

  <main class="organized-main">
    <header class="organized-topbar">
      <div>
        <span class="organized-eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
      </div>
      <div class="organized-top-actions">
        {#if headerActions}{@render headerActions()}{/if}
        {#if connected}
          <button class="org-button secondary" type="button" disabled={syncing} onclick={syncNow}>
            {#if syncing}<LoaderCircle class="spin" size={16} />{:else}<RefreshCw size={16} />{/if}
            {syncing ? 'Syncing…' : 'Sync eBay'}
          </button>
        {:else}
          <a class="org-button primary" href="/integrations/ebay"><PlugZap size={16} /> Connect eBay</a>
        {/if}
      </div>
    </header>

    {#if syncMessage}
      <div class:error={syncError} class="organized-sync-banner">
        {#if syncError}<ShieldCheck size={16} />{:else}<BadgeDollarSign size={16} />{/if}
        <span>{syncMessage}</span>
      </div>
    {/if}

    <div class="organized-page">
      {@render children()}
    </div>
  </main>
</div>
