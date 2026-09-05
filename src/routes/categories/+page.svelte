<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import {
    ArrowLeft,
    Check,
    Eye,
    EyeOff,
    Plus,
    Save,
    Tag,
    Trash2
  } from '@lucide/svelte';
  import type { InventoryCategoryDefinition } from '$lib/types';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  let builtInCategories = $state<InventoryCategoryDefinition[]>([]);
  let customCategories = $state<InventoryCategoryDefinition[]>([]);
  let builtInPrefixDrafts = $state<Record<string, string>>({});
  let savingBuiltInId = $state<string | null>(null);

  $effect(() => {
    builtInCategories = [...(data.builtInCategories ?? [])];
    customCategories = [...(data.customCategories ?? [])];
    builtInPrefixDrafts = Object.fromEntries(
      (data.builtInCategories ?? []).map((category) => [category.value, category.prefix])
    );
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

  function cleanPrefix(value: string) {
    return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  }

  async function saveBuiltIn(
    category: InventoryCategoryDefinition,
    enabled = category.enabled !== false
  ) {
    if (savingBuiltInId) return;

    const nextPrefix = cleanPrefix(
      builtInPrefixDrafts[category.value] ?? category.prefix
    );

    if (nextPrefix.length < 2) {
      error = 'Default SKU prefix must be 2–8 letters or numbers.';
      return;
    }

    savingBuiltInId = category.value;
    message = null;
    error = null;

    const response = await fetch('/api/inventory/categories', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: category.value,
        prefix: nextPrefix,
        enabled
      })
    });

    const result = await response.json().catch(() => null) as {
      error?: string;
      category?: InventoryCategoryDefinition;
    } | null;

    savingBuiltInId = null;

    if (!response.ok || !result?.category) {
      error = result?.error ?? 'Could not update this built-in category.';
      return;
    }

    builtInCategories = builtInCategories.map((row) =>
      row.value === category.value ? result.category! : row
    );
    builtInPrefixDrafts = {
      ...builtInPrefixDrafts,
      [category.value]: result.category.prefix
    };

    message = enabled
      ? `${result.category.label} is enabled. New auto-SKUs will default to ${result.category.prefix}.`
      : `${result.category.label} is hidden from new inventory. Existing SKU history was not changed.`;

    await invalidateAll();
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
        Categories drive filters and analytics. The SKU prefix shown here is only the
        <strong>default for new auto-generated SKUs</strong>. Changing it never renames an existing item.
      </p>
    </section>

    {#if error}<div class="global-message error">{error}</div>{/if}
    {#if message}<div class="global-message success">{message}</div>{/if}

    <section class="category-layout">
      <article class="category-panel">
        <div class="panel-head">
          <div>
            <span class="eyebrow">SELLQUITY BUILT-INS</span>
            <h2>Broad defaults, your way</h2>
          </div>
          <span class="system-note"><Check size={13} /> Stable category identities</span>
        </div>

        <div class="built-in-note">
          Disable a category to remove it from new Intake, Purchase Lots, bulk editing, and filters.
          Sellquity will never rewrite existing SKUs. <strong>Other</strong> remains enabled as the safe import fallback.
        </div>

        <div class="category-grid">
          {#each builtInCategories as category}
            <div class:disabled={category.enabled === false} class="category-card">
              <div class="category-card-head">
                <span>
                  <strong>{category.label}</strong>
                  <small>
                    {usage(category)} tracked item{usage(category) === 1 ? '' : 's'}
                    · {category.enabled === false ? 'disabled' : 'enabled'}
                  </small>
                </span>

                <button
                  type="button"
                  class:enabled={category.enabled !== false}
                  class="visibility"
                  disabled={
                    savingBuiltInId === category.value ||
                    (category.value !== 'other' && category.enabled !== false && usage(category) > 0)
                  }
                  title={
                    category.value === 'other'
                      ? 'Other stays enabled as Sellquity’s safe fallback.'
                      : category.enabled !== false && usage(category) > 0
                        ? 'Move all inventory out of this category before disabling it.'
                        : category.enabled === false
                          ? 'Enable category'
                          : 'Disable category'
                  }
                  onclick={() => saveBuiltIn(category, category.enabled === false)}
                >
                  {#if category.enabled === false}
                    <EyeOff size={14} /> Disabled
                  {:else}
                    <Eye size={14} /> Enabled
                  {/if}
                </button>
              </div>

              <div class="prefix-editor">
                <label>
                  <span>Default SKU prefix</span>
                  <input
                    value={builtInPrefixDrafts[category.value] ?? category.prefix}
                    maxlength="8"
                    oninput={(event) => {
                      builtInPrefixDrafts = {
                        ...builtInPrefixDrafts,
                        [category.value]: cleanPrefix(event.currentTarget.value)
                      };
                    }}
                  />
                </label>

                <button
                  type="button"
                  class="save-prefix"
                  disabled={
                    savingBuiltInId === category.value ||
                    cleanPrefix(builtInPrefixDrafts[category.value] ?? '') === category.prefix
                  }
                  onclick={() => saveBuiltIn(category)}
                >
                  <Save size={14} />
                  {savingBuiltInId === category.value ? 'Saving…' : 'Save'}
                </button>
              </div>

              <div class="identity-note">
                Existing {category.prefix}-#### SKUs remain exactly as they are.
              </div>
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
            <input
              value={prefix}
              maxlength="8"
              placeholder="ADV"
              required
              oninput={(event) => prefix = cleanPrefix(event.currentTarget.value)}
            />
            <small>2–8 letters or numbers. You can override it per item later.</small>
          </label>

          <button disabled={saving}>
            <Plus size={15} /> {saving ? 'Creating…' : 'Create category'}
          </button>
        </form>

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
              <small>
                The broad Sellquity defaults may be enough. Create one only when it improves your analytics.
              </small>
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
    padding: 0 max(20px, calc((100vw - 1240px) / 2));
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

  .category-topbar > span,
  .system-note {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    border: 1px solid #1d4866;
    border-radius: 999px;
    padding: 6px 10px;
    color: #61e7d3;
    background: #09202b;
    font: 800 .64rem "SFMono-Regular", Consolas, monospace;
    letter-spacing: .06em;
  }

  main {
    width: min(1240px, calc(100% - 36px));
    margin: 0 auto;
    padding: 44px 0 80px;
  }

  .eyebrow {
    color: #01d4a5;
    font: 850 .67rem "SFMono-Regular", Consolas, monospace;
    letter-spacing: .14em;
  }

  .category-hero { margin-bottom: 20px; }

  h1 {
    margin: 8px 0 14px;
    font-size: clamp(2.2rem, 5vw, 4.25rem);
    line-height: .95;
    letter-spacing: -.055em;
  }

  h1 em { color: #01d0e9; font-style: normal; }

  .category-hero p {
    max-width: 850px;
    margin: 0;
    color: #8da0ba;
    font-size: .87rem;
    line-height: 1.6;
  }

  .category-hero p strong { color: #d9e8f3; }

  .global-message {
    margin: 0 0 14px;
    border-radius: 9px;
    padding: 10px 12px;
    font-size: .68rem;
    line-height: 1.4;
  }

  .global-message.success {
    border: 1px solid #175564;
    color: #6de8d8;
    background: #08242b;
  }

  .global-message.error {
    border: 1px solid #69343b;
    color: #ff9ca3;
    background: #281319;
  }

  .category-layout {
    display: grid;
    grid-template-columns: minmax(0, 1.55fr) minmax(330px, .55fr);
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
    margin-bottom: 14px;
  }

  h2 { margin: 5px 0 0; font-size: 1.08rem; }

  .built-in-note {
    margin-bottom: 14px;
    border: 1px solid #183a4d;
    border-radius: 9px;
    padding: 9px 11px;
    color: #6f8da2;
    background: #071722;
    font-size: .63rem;
    line-height: 1.45;
  }

  .built-in-note strong { color: #9fd8e3; }

  .category-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 9px;
  }

  .category-card {
    min-width: 0;
    border: 1px solid #18374e;
    border-radius: 10px;
    padding: 11px;
    background: #08141f;
  }

  .category-card.disabled {
    border-color: #26303b;
    background: #0a1017;
    opacity: .68;
  }

  .category-card-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 9px;
  }

  .category-card-head > span {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .category-card-head strong { font-size: .73rem; }
  .category-card-head small { color: #658298; font-size: .58rem; }

  .visibility {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    border: 1px solid #4e3840;
    border-radius: 999px;
    padding: 5px 7px;
    color: #b9838c;
    background: #20151a;
    font: inherit;
    font-size: .57rem;
    font-weight: 850;
    cursor: pointer;
  }

  .visibility.enabled {
    border-color: #185864;
    color: #63e5d4;
    background: #082329;
  }

  .visibility:disabled {
    opacity: .45;
    cursor: not-allowed;
  }

  .prefix-editor {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 7px;
    align-items: end;
    margin-top: 10px;
  }

  label { display: grid; gap: 5px; }

  label > span {
    color: #819aae;
    font-size: .61rem;
    font-weight: 800;
  }

  label small {
    color: #5f7d93;
    font-size: .58rem;
    line-height: 1.35;
  }

  input {
    width: 100%;
    border: 1px solid #24445f;
    border-radius: 8px;
    padding: 9px 10px;
    color: #eef8ff;
    background: #07111b;
    font: inherit;
    font-size: .72rem;
  }

  input:focus {
    outline: 0;
    border-color: #1985a8;
    box-shadow: 0 0 0 3px #01d0e910;
  }

  .save-prefix {
    min-height: 35px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    border: 1px solid #1f6479;
    border-radius: 8px;
    padding: 0 9px;
    color: #62e5d3;
    background: #09232c;
    font-weight: 850;
    cursor: pointer;
  }

  .save-prefix:disabled {
    opacity: .3;
    cursor: not-allowed;
  }

  .identity-note {
    margin-top: 7px;
    color: #536f83;
    font-size: .55rem;
  }

  form {
    display: grid;
    gap: 10px;
    border-bottom: 1px solid #173047;
    padding-bottom: 16px;
  }

  form > button {
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

  form > button:disabled { opacity: .45; cursor: not-allowed; }

  .custom-list {
    display: grid;
    gap: 7px;
    margin-top: 14px;
  }

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

  .custom-row > span:nth-child(2) {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .custom-row strong { font-size: .72rem; }
  .custom-row small { color: #658298; font-size: .6rem; }

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

  .empty small {
    max-width: 290px;
    font-size: .61rem;
    line-height: 1.4;
  }

  @media (max-width: 920px) {
    .category-layout { grid-template-columns: 1fr; }
    .custom-panel { position: static; }
  }

  @media (max-width: 680px) {
    .category-grid { grid-template-columns: 1fr; }
  }

  @media (max-width: 580px) {
    main {
      width: min(100% - 24px, 1240px);
      padding-top: 32px;
    }

    .category-topbar { padding: 0 14px; }
    .category-topbar > span { display: none; }
    .system-note { display: none; }
  }
</style>
