<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { Check, ChevronDown, CircleDollarSign, Ellipsis, HeartHandshake, PackageX, ReceiptText, X } from '@lucide/svelte';
  import { money } from '$lib/money';

  let {
    item,
    detail = false
  }: {
    item: {
      id: string;
      title: string;
      costCents: number | null;
      status: string;
    };
    detail?: boolean;
  } = $props();

  type Mode = 'sale' | 'expense' | 'credit' | 'donated' | 'damaged' | null;

  let menuOpen = $state(false);
  let mode = $state<Mode>(null);
  let saving = $state(false);
  let message = $state<string | null>(null);

  let date = $state(new Date().toISOString().slice(0, 10));
  let amount = $state('');
  let note = $state('');

  let channel = $state('Local / cash');
  let salePrice = $state('');
  let buyerShipping = $state('0');
  let fees = $state('0');
  let shippingLabel = $state('0');
  let tracking = $state('');

  function open(next: Exclude<Mode, null>) {
    menuOpen = false;
    mode = next;
    saving = false;
    message = null;
    date = new Date().toISOString().slice(0, 10);
    amount = '';
    note = '';
    channel = 'Local / cash';
    salePrice = '';
    buyerShipping = '0';
    fees = '0';
    shippingLabel = '0';
    tracking = '';
  }

  function close() {
    if (!saving) mode = null;
  }

  function toCents(value: string) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round(parsed * 100) : Number.NaN;
  }

  async function saveAdjustment(event: SubmitEvent) {
    event.preventDefault();
    if (mode !== 'expense' && mode !== 'credit') return;

    const amountCents = toCents(amount);
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      message = 'Enter an amount greater than $0.';
      return;
    }

    saving = true;
    message = null;
    const response = await fetch(`/api/inventory/${encodeURIComponent(item.id)}/actions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: mode, amountCents, date, note })
    });
    const result = await response.json().catch(() => null) as { error?: string } | null;
    saving = false;

    if (!response.ok) {
      message = result?.error ?? 'Could not update this item.';
      return;
    }

    mode = null;
    await invalidateAll();
  }

  async function saveDisposition(event: SubmitEvent) {
    event.preventDefault();
    if (mode !== 'donated' && mode !== 'damaged') return;

    saving = true;
    message = null;
    const response = await fetch(`/api/inventory/${encodeURIComponent(item.id)}/actions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: mode, date, note })
    });
    const result = await response.json().catch(() => null) as { error?: string } | null;
    saving = false;

    if (!response.ok) {
      message = result?.error ?? 'Could not close out this item.';
      return;
    }

    mode = null;
    await invalidateAll();
  }

  async function saveSale(event: SubmitEvent) {
    event.preventDefault();
    const salePriceCents = toCents(salePrice);
    const buyerShippingCents = toCents(buyerShipping || '0');
    const feesCents = toCents(fees || '0');
    const shippingLabelCents = toCents(shippingLabel || '0');

    if (![salePriceCents, buyerShippingCents, feesCents, shippingLabelCents].every(Number.isInteger) || salePriceCents <= 0) {
      message = 'Enter a valid sale price and money amounts.';
      return;
    }

    saving = true;
    message = null;
    const response = await fetch('/api/manual-sales', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        inventoryItemId: item.id,
        soldAt: date,
        channel,
        quantity: 1,
        salePriceCents,
        buyerShippingCents,
        feesCents,
        shippingLabelCents,
        trackingNumber: tracking,
        note
      })
    });
    const result = await response.json().catch(() => null) as { error?: string } | null;
    saving = false;

    if (!response.ok) {
      message = result?.error ?? 'Could not record this sale.';
      return;
    }

    mode = null;
    await invalidateAll();
  }
  function portal(node: HTMLElement) {
    document.body.appendChild(node);

    return {
      destroy() {
        node.remove();
      }
    };
  }

</script>

<div class:detail class="item-actions">
  {#if detail}
    <button class="org-button primary action-sale" type="button" onclick={() => open('sale')}>
      <CircleDollarSign size={15} /> Record sale
    </button>
    <button class="org-button secondary action-menu-button" type="button" aria-label={`Actions for ${item.title}`} aria-expanded={menuOpen} onclick={() => menuOpen = !menuOpen}>
      Actions <ChevronDown size={14} />
    </button>
  {:else}
    <button class="dots" type="button" aria-label={`Actions for ${item.title}`} aria-expanded={menuOpen} onclick={() => menuOpen = !menuOpen}>
      <Ellipsis size={17} />
    </button>
  {/if}
  {#if menuOpen}
    <div class:detail-menu={detail} class="menu">
      {#if !detail}<button type="button" onclick={() => open('sale')}><CircleDollarSign size={14} /><span>Record sale</span></button>{/if}
      <button type="button" onclick={() => open('expense')}><ReceiptText size={14} /><span>Add expense</span></button>
      <button type="button" onclick={() => open('credit')}><ReceiptText size={14} /><span>Add credit</span></button>
      <div class="divider"></div>
      <button type="button" onclick={() => open('donated')}><HeartHandshake size={14} /><span>Mark donated</span></button>
      <button class="danger" type="button" onclick={() => open('damaged')}><PackageX size={14} /><span>Mark damaged</span></button>
    </div>
  {/if}
</div>

{#if mode}
  <div class="org-modal-backdrop item-action-backdrop" role="presentation" use:portal>
    <div class="org-modal compact" role="dialog" aria-modal="true">
      <button class="org-modal-close" type="button" aria-label="Close" onclick={close}><X size={17} /></button>
      <div class="item-action-modal-scroll">

      {#if mode === 'sale'}
        <div class="org-card-head"><div><span class="org-kicker">RECORD SALE</span><h2>{item.title}</h2><p>Use this when the item sold somewhere outside Sellquity's automatic eBay flow.</p></div></div>
        <form onsubmit={saveSale}>
          <div class="org-form-grid">
            <label class="org-field"><span>Sold on</span><select class="org-select" bind:value={channel}><option>Local / cash</option><option>Facebook Marketplace</option><option>Whatnot</option><option>Mercari</option><option>Poshmark</option><option>Depop</option><option>Other</option></select></label>
            <label class="org-field"><span>Date sold</span><input class="org-input" type="date" bind:value={date} required /></label>
            <label class="org-field"><span>Sale price</span><input class="org-input" inputmode="decimal" bind:value={salePrice} placeholder="0.00" required /></label>
            <label class="org-field"><span>Buyer-paid shipping</span><input class="org-input" inputmode="decimal" bind:value={buyerShipping} /></label>
            <label class="org-field"><span>Fees paid</span><input class="org-input" inputmode="decimal" bind:value={fees} /></label>
            <label class="org-field"><span>Shipping cost</span><input class="org-input" inputmode="decimal" bind:value={shippingLabel} /></label>
            <label class="org-field wide"><span>Tracking number <small>optional</small></span><input class="org-input" bind:value={tracking} /></label>
            <label class="org-field wide"><span>Note <small>optional</small></span><textarea class="org-input" rows="3" bind:value={note}></textarea></label>
          </div>
          <div class="current-cost">Current purchase cost: <strong>{item.costCents == null ? 'missing' : money(item.costCents)}</strong></div>
          <p class="warning">If this item is still live on eBay, end that listing there too. Sellquity will close the local listing record but does not end the eBay listing.</p>
          {#if message}<p class="org-form-message bad">{message}</p>{/if}
          <div class="org-form-actions"><button class="org-button secondary" type="button" onclick={close}>Cancel</button><button class="org-button primary" disabled={saving}>{saving ? 'Saving…' : 'Record sale'}</button></div>
        </form>
      {:else if mode === 'expense' || mode === 'credit'}
        <div class="org-card-head"><div><span class="org-kicker">ITEM COST</span><h2>{mode === 'expense' ? 'Add an expense' : 'Add a credit'}</h2><p>{mode === 'expense' ? 'Adds to this item’s purchase cost.' : 'Reduces this item’s purchase cost.'}</p></div></div>
        <form onsubmit={saveAdjustment}>
          <div class="org-form-grid">
            <label class="org-field"><span>Amount</span><input class="org-input" inputmode="decimal" bind:value={amount} placeholder="0.00" required /></label>
            <label class="org-field"><span>Date</span><input class="org-input" type="date" bind:value={date} required /></label>
            <label class="org-field wide"><span>Note <small>optional</small></span><input class="org-input" bind:value={note} placeholder="Repair, partial refund, cleaning…" /></label>
          </div>
          <div class="current-cost">Current purchase cost: <strong>{item.costCents == null ? money(0) : money(item.costCents)}</strong></div>
          {#if message}<p class="org-form-message bad">{message}</p>{/if}
          <div class="org-form-actions"><button class="org-button secondary" type="button" onclick={close}>Cancel</button><button class="org-button primary" disabled={saving}>{saving ? 'Saving…' : mode === 'expense' ? 'Add expense' : 'Add credit'}</button></div>
        </form>
      {:else}
        <div class="org-card-head"><div><span class="org-kicker">CLOSE OUT INVENTORY</span><h2>Mark as {mode}</h2><p>This removes the item from current inventory without creating a sale.</p></div></div>
        <form onsubmit={saveDisposition}>
          <div class="org-form-grid">
            <label class="org-field"><span>Date</span><input class="org-input" type="date" bind:value={date} required /></label>
            <label class="org-field wide"><span>Note <small>optional</small></span><textarea class="org-input" rows="3" bind:value={note} placeholder={mode === 'donated' ? 'Where was it donated?' : 'What happened to it?'}></textarea></label>
          </div>
          <p class="warning">This does not create revenue. Any active Sellquity listing record will be closed locally.</p>
          {#if message}<p class="org-form-message bad">{message}</p>{/if}
          <div class="org-form-actions"><button class="org-button secondary" type="button" onclick={close}>Cancel</button><button class="org-button primary" disabled={saving}>{saving ? 'Saving…' : `Mark ${mode}`}</button></div>
        </form>
      {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .item-actions { position:relative; display:inline-flex; justify-content:flex-end; gap:7px; }
  .item-actions.detail { align-items:center; }
  .action-sale, .action-menu-button { white-space:nowrap; }
  .action-menu-button { min-width:92px; }
  .dots { width:32px; height:30px; display:grid; place-items:center; border:1px solid #294354; border-radius:7px; color:#91a9b8; background:#0b1721; cursor:pointer; }
  .dots:hover { color:#e9f3f7; border-color:#3d687e; }
  .menu { position:absolute; z-index:30; top:35px; right:0; width:178px; padding:6px; border:1px solid #294354; border-radius:10px; background:#09141d; box-shadow:0 18px 45px #0008; text-align:left; }
  .menu.detail-menu { top:44px; }
  .menu button { width:100%; display:flex; align-items:center; gap:8px; border:0; border-radius:7px; padding:9px 10px; color:#c9d8e0; background:transparent; font:inherit; font-size:.68rem; cursor:pointer; }
  .menu button:hover { background:#102331; color:#fff; }
  .menu button.danger { color:#ef9da5; }
  .divider { height:1px; margin:5px 3px; background:#203544; }
  .item-action-backdrop {
    position: fixed !important;
    inset: 0 !important;
    z-index: 2147483000 !important;
    display: grid !important;
    place-items: center !important;
    padding: 24px;
    overflow: hidden !important;
    isolation: isolate;
  }
  .compact {
    position: relative;
    width: min(720px, calc(100vw - 32px));
    max-height: min(86dvh, 820px);
    display: flex;
    flex-direction: column;
    overflow: hidden !important;
    margin: 0;
  }
  .item-action-modal-scroll {
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0;
    scrollbar-gutter: stable;
  }
  .item-action-modal-scroll > :global(.org-card-head) {
    padding-right: 44px;
  }
  .current-cost { margin:12px 0 0; color:#7893a2; font-size:.68rem; }
  .current-cost strong { color:#e7f1f5; }
  .warning { margin:12px 0 0; border:1px solid #58472d; border-radius:8px; padding:9px 10px; color:#cbaa70; background:#1d1810; font-size:.64rem; line-height:1.5; }
</style>
