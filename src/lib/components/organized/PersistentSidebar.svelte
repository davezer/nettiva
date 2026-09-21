<script lang="ts">
  import type { Snippet } from 'svelte';
  import { page } from '$app/state';
  import {
    BarChart3,
    Boxes,
    ChevronRight,
    ClipboardCheck,
    Home,
    Menu,
    PackageCheck,
    Settings,
    ShoppingBag,
    UserRound,
    WalletCards,
    X
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

  let mobileNavOpen = $state(false);

  const navItems = [
    { key: 'home', label: 'Home', href: '/', icon: Home },
    { key: 'inventory', label: 'Inventory', href: '/inventory', icon: Boxes, count: 'inventoryAll' as const },
    { key: 'sales', label: 'Sales', href: '/sold', icon: PackageCheck, count: 'soldAll' as const },
    { key: 'money', label: 'Money', href: '/money', icon: WalletCards },
    { key: 'insights', label: 'Insights', href: '/insights', icon: BarChart3 },
    { key: 'settings', label: 'Settings', href: '/manage', icon: Settings }
  ];

  function activeFromRoute() {
    const pathname = page.url.pathname;

    if (pathname === '/') return 'home';
    if (pathname.startsWith('/inventory') || pathname.startsWith('/listing-prep') || pathname.startsWith('/purchase-lots')) return 'inventory';
    if (pathname.startsWith('/sold') || pathname.startsWith('/cogs')) return 'sales';
    if (pathname.startsWith('/money')) return 'money';
    if (pathname.startsWith('/insights')) return 'insights';
    if (
      pathname.startsWith('/manage') ||
      pathname.startsWith('/categories') ||
      pathname.startsWith('/marketplaces') ||
      pathname.startsWith('/import') ||
      pathname.startsWith('/integrations') ||
      pathname.startsWith('/reconciliation')
    ) return 'settings';
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

<div class:mobile-nav-open={mobileNavOpen} class="organized-shell">
  <aside class="organized-sidebar">
    <div class="organized-mobile-bar">
      <a class="organized-brand" href="/" aria-label="Sellquity home" data-sveltekit-preload-data="hover">
        <span class="organized-brand-mark"><img src="/s-no-bg.png" alt="" /></span>
        <span><strong>SELLQUITY</strong><small>Reseller ledger</small></span>
      </a>

      <button
        class="organized-mobile-menu"
        type="button"
        aria-label={mobileNavOpen ? 'Close navigation' : 'Open navigation'}
        aria-expanded={mobileNavOpen}
        onclick={() => mobileNavOpen = !mobileNavOpen}
      >
        {#if mobileNavOpen}<X size={21} />{:else}<Menu size={21} />{/if}
      </button>
    </div>

    <div class="organized-mobile-drawer">
      <div class="organized-nav-caption">
        <span>WORKSPACE</span>
        <b>{workspace.name}</b>
      </div>

      <nav class="organized-nav" aria-label="Primary navigation" data-sveltekit-preload-data="hover">
        {#each navItems as item}
          {@const Icon = item.icon}
          <a
            class:active={active === item.key}
            class="organized-nav-home"
            href={item.href}
            onclick={() => mobileNavOpen = false}
          >
            <Icon size={18} />
            <span>{item.label}</span>
            {#if 'count' in item && item.count}
              <b>{counts[item.count]}</b>
            {/if}
          </a>
        {/each}
      </nav>

      <div class="organized-nav-caption">
        <span>QUICK ACTIONS</span>
      </div>
      <div class="organized-nav-children">
        <a href="/purchase-lots" onclick={() => mobileNavOpen = false}>
          <ShoppingBag size={14} />
          <span>Add a purchase</span>
        </a>
        <a href="/listing-prep" onclick={() => mobileNavOpen = false}>
          <ClipboardCheck size={14} />
          <span>Prep listings</span>
        </a>
      </div>

      <div class="organized-sidebar-footer">
        <a href="/account" class:active={active === 'account'} onclick={() => mobileNavOpen = false}>
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
        <div class="organized-legal-links">
          <a href="/support" onclick={() => mobileNavOpen = false}>Support</a>
          <a href="/privacy" onclick={() => mobileNavOpen = false}>Privacy</a>
          <a href="/terms" onclick={() => mobileNavOpen = false}>Terms</a>
        </div>
      </div>
    </div>
  </aside>

  {#if mobileNavOpen}
    <button
      class="organized-mobile-scrim"
      type="button"
      aria-label="Close navigation"
      onclick={() => mobileNavOpen = false}
    ></button>
  {/if}

  <main class="organized-main frame-only">
    {@render children()}
  </main>
</div>


<style>
  .organized-legal-links {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 12px;
    padding: 2px 4px 0;
  }

  .organized-legal-links a {
    color: #5f7887;
    font-size: .61rem;
    font-weight: 800;
    text-decoration: none;
  }

  .organized-legal-links a:hover {
    color: #01d4a5;
  }
</style>
