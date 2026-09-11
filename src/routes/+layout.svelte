<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { LayoutData } from './$types';
  import '../app.css';
  import '../accounting.css';
  import '../sellquity-theme.css';
  import '../midnight-polish.css';
  import '../mobile-polish.css';
  import PersistentSidebar from '$lib/components/organized/PersistentSidebar.svelte';
  import '../brand-cleanup.css';
  import '../workspace-index-cleanup.css';

  let {
    children,
    data
  }: {
    children: Snippet;
    data: LayoutData;
  } = $props();
</script>

<svelte:head>
  <title>Sellquity · Resale intelligence</title>
  <meta name="description" content="Inventory, sales, accounting, and true profit for your resale business." />
  <meta name="theme-color" content="#0b1020" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <link rel="icon" href="/favicon.svg" />
</svelte:head>

{#if data.shell}
  <PersistentSidebar
    workspace={data.shell.workspace}
    connected={data.shell.connected}
    lastSyncedAt={data.shell.lastSyncedAt}
    counts={data.shell.counts}
  >
    {@render children()}
  </PersistentSidebar>
{:else}
  {@render children()}
{/if}
