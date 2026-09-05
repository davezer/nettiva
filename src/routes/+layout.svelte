<script lang="ts">
  import '../app.css';
  import '../accounting.css';
  import '../sellquity-theme.css';
  let { children } = $props();
</script>

<svelte:head>
  <title>Sellquity · Resale intelligence</title>
  <meta name="description" content="Inventory, sales, accounting, and true profit for your resale business." />
  <meta name="theme-color" content="#050b14" />
  <link rel="icon" href="/favicon.svg" />
</svelte:head>

{@render children()}
