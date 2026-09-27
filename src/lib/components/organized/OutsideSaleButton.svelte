<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { Check, Plus, X } from '@lucide/svelte';

  let open = $state(false);
  let saving = $state(false);
  let message = $state<string | null>(null);

  let title = $state('');
  let soldAt = $state(new Date().toISOString().slice(0, 10));
  let channel = $state('Local / cash');
  let quantity = $state('1');
  let salePrice = $state('');
  let buyerShipping = $state('0');
  let purchaseCost = $state('');
  let fees = $state('0');
  let shippingLabel = $state('0');
  let tracking = $state('');
  let imageUrl = $state('');
  let note = $state('');

  function reset() {
    title = '';
    soldAt = new Date().toISOString().slice(0, 10);
    channel = 'Local / cash';
    quantity = '1';
    salePrice = '';
    buyerShipping = '0';
    purchaseCost = '';
    fees = '0';
    shippingLabel = '0';
    tracking = '';
    imageUrl = '';
    note = '';
    message = null;
  }

  function show() {
    reset();
    open = true;
  }

  function toCents(value: string, optional = false) {
    if (optional && !value.trim()) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round(parsed * 100) : Number.NaN;
  }

  async function save(event: SubmitEvent) {
    event.preventDefault();

    const salePriceCents = toCents(salePrice);
    const buyerShippingCents = toCents(buyerShipping || '0');
    const purchaseCostCents = toCents(purchaseCost, true);
    const feesCents = toCents(fees || '0');
    const shippingLabelCents = toCents(shippingLabel || '0');
    const parsedQuantity = Number(quantity);

    const moneyValues = [salePriceCents, buyerShippingCents, feesCents, shippingLabelCents];
    if (
      !title.trim() ||
      !moneyValues.every((value) => Number.isInteger(value) && Number(value) >= 0) ||
      salePriceCents == null || salePriceCents <= 0 ||
      (purchaseCostCents != null && (!Number.isInteger(purchaseCostCents) || purchaseCostCents < 0)) ||
      !Number.isInteger(parsedQuantity) || parsedQuantity < 1 || parsedQuantity > 50
    ) {
      message = 'Enter an item name, sale price, and valid amounts.';
      return;
    }

    saving = true;
    message = null;
    const response = await fetch('/api/manual-sales', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: title.trim(),
        soldAt,
        channel,
        quantity: parsedQuantity,
        salePriceCents,
        buyerShippingCents,
        purchaseCostCents,
        feesCents,
        shippingLabelCents,
        trackingNumber: tracking,
        imageUrl,
        note
      })
    });
    const result = await response.json().catch(() => null) as { error?: string } | null;
    saving = false;

    if (!response.ok) {
      message = result?.error ?? 'Could not record the sale.';
      return;
    }

    open = false;
    await invalidateAll();
  }
</script>

<button class="org-button primary" type="button" onclick={show}><Plus size={15} /> Record outside sale</button>

{#if open}
  <div class="org-modal-backdrop" role="presentation">
    <div class="org-modal outside-sale" role="dialog" aria-modal="true" aria-labelledby="outside-sale-title">
      <button class="org-modal-close" type="button" aria-label="Close" onclick={() => !saving && (open = false)}><X size={17} /></button>
      <div class="org-card-head">
        <div>
          <span class="org-kicker">OUTSIDE SALE</span>
          <h2 id="outside-sale-title">Record a sale Sellquity didn't import</h2>
          <p>Use this for local sales or marketplaces that are not automatically connected.</p>
        </div>
      </div>

      <form onsubmit={save}>
        <div class="org-form-grid">
          <label class="org-field wide"><span>Item name</span><input class="org-input" bind:value={title} required placeholder="What sold?" /></label>
          <label class="org-field"><span>Sold on</span><select class="org-select" bind:value={channel}><option>Local / cash</option><option>Facebook Marketplace</option><option>Whatnot</option><option>Mercari</option><option>Poshmark</option><option>Depop</option><option>Other</option></select></label>
          <label class="org-field"><span>Date sold</span><input class="org-input" type="date" bind:value={soldAt} required /></label>
          <label class="org-field"><span>Sale price</span><input class="org-input" inputmode="decimal" bind:value={salePrice} required placeholder="0.00" /></label>
          <label class="org-field"><span>Quantity</span><input class="org-input" type="number" min="1" max="50" bind:value={quantity} /></label>
          <label class="org-field"><span>Purchase cost <small>optional</small></span><input class="org-input" inputmode="decimal" bind:value={purchaseCost} placeholder="0.00" /></label>
          <label class="org-field"><span>Buyer-paid shipping</span><input class="org-input" inputmode="decimal" bind:value={buyerShipping} /></label>
          <label class="org-field"><span>Fees paid</span><input class="org-input" inputmode="decimal" bind:value={fees} /></label>
          <label class="org-field"><span>Shipping cost</span><input class="org-input" inputmode="decimal" bind:value={shippingLabel} /></label>
          <label class="org-field"><span>Tracking # <small>optional</small></span><input class="org-input" bind:value={tracking} /></label>
          <label class="org-field wide"><span>Photo URL <small>optional</small></span><input class="org-input" type="url" bind:value={imageUrl} placeholder="https://…" /></label>
          <label class="org-field wide"><span>Note <small>optional</small></span><textarea class="org-input" rows="3" bind:value={note} placeholder="Anything worth remembering about the sale"></textarea></label>
        </div>
        {#if message}<p class="org-form-message bad">{message}</p>{/if}
        <div class="org-form-actions">
          <button class="org-button secondary" type="button" onclick={() => open = false}>Cancel</button>
          <button class="org-button primary" disabled={saving}>{#if saving}Saving…{:else}<Check size={15} /> Record sale{/if}</button>
        </div>
      </form>
    </div>
  </div>
{/if}

<style>
  .outside-sale { width:min(760px, calc(100vw - 28px)); max-height:min(88vh, 820px); overflow:auto; }
</style>
