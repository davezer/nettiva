<script lang="ts">
  import type { Snippet } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import {
    BadgeDollarSign,
    LoaderCircle,
    PlugZap,
    RefreshCw,
    ShieldCheck
  } from '@lucide/svelte';
  import type { WorkspaceSummary } from '$lib/types';
  import './organized.css';

  let {
    children,
    eyebrow,
    title,
    connected,
    headerActions
  }: {
    children: Snippet;
    eyebrow: string;
    title: string;
    connected: boolean;
    headerActions?: Snippet;
    active?: string;
    workspace?: WorkspaceSummary;
    lastSyncedAt?: string | null;
    counts?: unknown;
  } = $props();


  let syncing = $state(false);
  let syncMessage = $state<string | null>(null);
  let syncError = $state(false);

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

      syncMessage = pieces.length
        ? `Live sync complete — ${pieces.join(', ')}.`
        : 'Live eBay sync complete.';

      await invalidateAll();
    } catch {
      syncError = true;
      syncMessage = 'Sellquity could not reach the eBay sync endpoint.';
    } finally {
      syncing = false;
    }
  }
</script>

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
