<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import {
    ArrowLeft,
    Check,
    Plus,
    Tag,
    Trash2
  } from '@lucide/svelte';
  import { BUILT_IN_INVENTORY_CATEGORIES } from '$lib/inventory-categories';
  import type { InventoryCategoryDefinition } from '$lib/types';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  let customCategories = $state<InventoryCategoryDefinition[]>([]);

  $effect(() => {
    customCategories = [...(data.customCategories ?? [])];
  });
  let label = $state('');
  let prefix = $state('');
  let saving = $state(false);
  let deletingId = $state<string | null>(null);
  let message = $state<string | null>(null);
  let error = $state<string | null>(null);

  function usage(category: InventoryCategoryDefinition) {
    return Number(data.usageByCategory?.[category.value] ?? 0);
  }

  async function addCategory(event: SubmitEvent) {
    event.preventDefault();
    if (saving) return;

    saving = true;
    message = null;
    error = null;

    const response = await fetch('/api/inventory/categories', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ label, prefix })
    });

    const result = await response.json().catch(() => null) as {
      error?: string;
      category?: InventoryCategoryDefinition;
    } | null;

    saving = false;

    if (!response.ok || !result?.category) {
      error = result?.error ?? 'Could not create this category.';
      return;
    }

    customCategories = [...customCategories, result.category]
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
    label = '';
    prefix = '';
    message = `${result.category.label} is ready for Intake, Purchase Lots, bulk edit, filters, and analytics.`;
    await invalidateAll();
  }

  async function deleteCategory(category: InventoryCategoryDefinition) {
    const count = usage(category);
    if (count || deletingId) return;

    deletingId = category.value;
    message = null;
    error = null;

    const response = await fetch('/api/inventory/categories', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: category.value })
    });

    const result = await response.json().catch(() => null) as { error?: string } | null;
    deletingId = null;

    if (!response.ok) {
      error = result?.error ?? 'Could not remove this category.';
      return;
    }

    customCategories = customCategories.filter((row) => row.value !== category.value);
    message = `${category.label} removed. Its SKU sequence was intentionally preserved.`;
    await invalidateAll();
  }
</script>

<svelte:head>
  <title>Inventory categories · Sellquity</title>
</svelte:head>

<div class="category-shell">
  <header class="category-topbar">
    <button type="button" onclick={() => goto('/')}><ArrowLeft size={16} /> Sellquity</button>
    <span><Tag size={14} /> CATEGORY MANAGER</span>
  </header>

  <main>
    <section class="category-hero">
      <span class="eyebrow">INVENTORY TAXONOMY</span>
      <h1>Categories should explain your business.<br /><em>Not become a junk drawer.</em></h1>
      <p>
        Categories drive filters and analytics. SKU prefixes are only the default organizational
        shorthand for new items. You can still override a prefix during intake without creating a
        microscopic reporting category.
      </p>
    </section>

    <section class="category-layout">
      <article class="category-panel">
        <div class="panel-head">
          <div><span class="eyebrow">SELLQUITY BUILT-INS</span><h2>Broad defaults</h2></div>
          <span class="locked"><Check size={13} /> System categories</span>
        </div>

        <div class="category-grid">
          {#each BUILT_IN_INVENTORY_CATEGORIES as category}
            <div class="category-card">
              <span class="category-prefix">{category.prefix}</span>
              <span>
                <strong>{category.label}</strong>
                <small>{usage(category)} tracked item{usage(category) === 1 ? '' : 's'}</small>
              </span>
            </div>
          {/each}
        </div>
      </article>

      <aside class="custom-panel">
        <div class="panel-head">
          <div><span class="eyebrow">YOUR WORKSPACE</span><h2>Custom categories</h2></div>
        </div>

        <form onsubmit={addCategory}>
          <label>
            <span>Category name</span>
            <input bind:value={label} maxlength="60" placeholder="Vintage Advertising" required />
          </label>
          <label>
            <span>Default SKU prefix</span>
            <input bind:value={prefix} maxlength="8" placeholder="ADV" required />
            <small>2–8 letters or numbers. You can override it per item later.</small>
          </label>
          <button disabled={saving}>
            <Plus size={15} /> {saving ? 'Creating…' : 'Create category'}
          </button>
        </form>

        {#if error}<div class="message error">{error}</div>{/if}
        {#if message}<div class="message success">{message}</div>{/if}

        <div class="custom-list">
          {#if customCategories.length}
            {#each customCategories as category}
              <div class="custom-row">
                <span class="category-prefix">{category.prefix}</span>
                <span>
                  <strong>{category.label}</strong>
                  <small>
                    {#if usage(category)}
                      {usage(category)} item{usage(category) === 1 ? '' : 's'} using this category
                    {:else}
                      Ready to use
                    {/if}
                  </small>
                </span>
                <button
                  type="button"
                  class="delete"
                  disabled={usage(category) > 0 || deletingId === category.value}
                  title={usage(category) ? 'Move inventory out of this category before deleting it.' : 'Delete custom category'}
                  onclick={() => deleteCategory(category)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            {/each}
          {:else}
            <div class="empty">
              <Tag size={23} />
              <strong>No custom categories yet.</strong>
              <small>The broad Sellquity defaults may be enough. Create one only when it improves your analytics.</small>
            </div>
          {/if}
        </div>
      </aside>
    </section>
  </main>
</div>

<style>
  :global(body) {
    margin: 0;
    background:
      radial-gradient(circle at 72% -20%, #0069e31b 0, transparent 34rem),
      #050b14;
    color: #f4f8ff;
    font-family: "Arial Narrow", "Roboto Condensed", Inter, ui-sans-serif, system-ui, sans-serif;
  }

  * { box-sizing: border-box; }

  .category-shell { min-height: 100vh; }
  .category-topbar {
    height: 64px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 max(20px, calc((100vw - 1180px) / 2));
    border-bottom: 1px solid #17304a;
    background: #07111bd9;
    backdrop-filter: blur(14px);
  }

  .category-topbar button,
  .category-topbar > span {
    display: inline-flex;
    align-items: center;
    gap: 7px;
  }

  .category-topbar button {
    border: 0;
    padding: 0;
    color: #91a8bc;
    background: transparent;
    font: inherit;
    font-size: .77rem;
    font-weight: 850;
    cursor: pointer;
  }

  .category-topbar > span {
    border: 1px solid #1d4866;
    border-radius: 999px;
    padding: 6px 10px;
    color: #61e7d3;
    background: #09202b;
    font: 800 .65rem "SFMono-Regular", Consolas, monospace;
    letter-spacing: .08em;
  }

  main {
    width: min(1180px, calc(100% - 36px));
    margin: 0 auto;
    padding: 48px 0 80px;
  }

  .eyebrow {
    color: #01d4a5;
    font: 850 .67rem "SFMono-Regular", Consolas, monospace;
    letter-spacing: .14em;
  }

  .category-hero { margin-bottom: 24px; }
  h1 {
    margin: 8px 0 14px;
    font-size: clamp(2.2rem, 5vw, 4.25rem);
    line-height: .95;
    letter-spacing: -.055em;
  }
  h1 em { color: #01d0e9; font-style: normal; }
  .category-hero p {
    max-width: 790px;
    margin: 0;
    color: #8da0ba;
    font-size: .87rem;
    line-height: 1.6;
  }

  .category-layout {
    display: grid;
    grid-template-columns: minmax(0, 1.35fr) minmax(320px, .65fr);
    gap: 18px;
    align-items: start;
  }

  .category-panel,
  .custom-panel {
    border: 1px solid #19314f;
    border-radius: 15px;
    padding: 20px;
    background: linear-gradient(145deg, #0d1928, #09131f);
    box-shadow: 0 12px 38px #0000002b;
  }

  .custom-panel { position: sticky; top: 82px; }

  .panel-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 16px;
  }

  h2 { margin: 5px 0 0; font-size: 1.1rem; }

  .locked {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    border: 1px solid #175564;
    border-radius: 999px;
    padding: 5px 8px;
    color: #65e7d4;
    background: #08242b;
    font-size: .62rem;
    font-weight: 850;
  }

  .category-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .category-card,
  .custom-row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 10px;
    align-items: center;
    border: 1px solid #18374e;
    border-radius: 9px;
    padding: 10px;
    background: #08141f;
  }

  .category-card {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .category-prefix {
    min-width: 43px;
    display: grid;
    place-items: center;
    border: 1px solid #1b617d;
    border-radius: 7px;
    padding: 6px 7px;
    color: #70eddd;
    background: #092436;
    font: 900 .62rem "SFMono-Regular", Consolas, monospace;
  }

  .category-card > span:last-child,
  .custom-row > span:nth-child(2) {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .category-card strong,
  .custom-row strong { font-size: .72rem; }
  .category-card small,
  .custom-row small { color: #658298; font-size: .6rem; }

  form {
    display: grid;
    gap: 10px;
    border-bottom: 1px solid #173047;
    padding-bottom: 16px;
  }

  label { display: grid; gap: 5px; }
  label > span { color: #819aae; font-size: .65rem; font-weight: 800; }
  label small { color: #5f7d93; font-size: .58rem; line-height: 1.35; }

  input {
    width: 100%;
    border: 1px solid #24445f;
    border-radius: 8px;
    padding: 10px 11px;
    color: #eef8ff;
    background: #07111b;
    font: inherit;
    font-size: .75rem;
  }

  input:focus {
    outline: 0;
    border-color: #1985a8;
    box-shadow: 0 0 0 3px #01d0e910;
  }

  form button {
    min-height: 40px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    border: 0;
    border-radius: 8px;
    color: #03131a;
    background: linear-gradient(135deg, #0069e3, #01d0e9 55%, #01d4a5);
    font-weight: 900;
    cursor: pointer;
  }

  form button:disabled { opacity: .45; cursor: not-allowed; }

  .message {
    margin-top: 11px;
    border-radius: 8px;
    padding: 9px 10px;
    font-size: .66rem;
    line-height: 1.4;
  }
  .message.success { border: 1px solid #175564; color: #6de8d8; background: #08242b; }
  .message.error { border: 1px solid #69343b; color: #ff9ca3; background: #281319; }

  .custom-list { display: grid; gap: 7px; margin-top: 14px; }

  .delete {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border: 1px solid #55313a;
    border-radius: 7px;
    color: #e87d87;
    background: #231218;
    cursor: pointer;
  }

  .delete:disabled {
    opacity: .28;
    cursor: not-allowed;
  }

  .empty {
    min-height: 150px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 5px;
    color: #55758b;
    text-align: center;
  }
  .empty strong { color: #9eb3c3; font-size: .74rem; }
  .empty small { max-width: 290px; font-size: .61rem; line-height: 1.4; }

  @media (max-width: 850px) {
    .category-layout { grid-template-columns: 1fr; }
    .custom-panel { position: static; }
  }

  @media (max-width: 580px) {
    main { width: min(100% - 24px, 1180px); padding-top: 32px; }
    .category-topbar { padding: 0 14px; }
    .category-topbar > span { display: none; }
    .category-grid { grid-template-columns: 1fr; }
  }
</style>
