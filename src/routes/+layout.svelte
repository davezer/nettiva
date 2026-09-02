<script lang="ts">
  import '../app.css';
  let { children } = $props();
</script>

<svelte:head>
  <title>Nettiva — Resale intelligence</title>
  <meta name="description" content="Inventory, sales, and true profit for your eBay business." />
  <link rel="icon" href="/favicon.svg" />
</svelte:head>

{@render children()}
