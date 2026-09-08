<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import {
    ArrowLeft,
    BadgeDollarSign,
    Check,
    CircleDollarSign,
    Clock3,
    PackageCheck,
    ReceiptText,
    Save,
    ShoppingBag,
    Tag
  } from '@lucide/svelte';
  import PageChrome from '$lib/components/organized/PageChrome.svelte';
  import { money, shortDate } from '$lib/money';

  let { data } = $props();

  const dashboard = $derived(data.dashboard);
  const sale = $derived(data.sale);
  const item = $derived(data.item);
  const transactions = $derived(data.transactions);

  let cost = $state('');
  let hydratedSaleId = $state<string | null>(null);
  let savingCost = $state(false);
  let costMessage = $state<string | null>(null);
  let costBad = $state(false);

  $effect(() => {
    const current = sale;
    if (hydratedSaleId === current.id) return;

    cost = current.cogsCents == null ? '' : (current.cogsCents / 100).toFixed(2);
    hydratedSaleId = current.id;
  });

  const gross = $derived(sale.salePriceCents + sale.shippingChargedCents);
  const refundsDisputes = $derived(sale.refundsCents + sale.disputesCents);
  const unsold = $derived(dashboard.inventory.filter((candidate) => candidate.status !== 'sold'));
  const missingInventory = $derived(unsold.filter((candidate) => candidate.costCents == null || !candidate.source?.trim() || !candidate.location?.trim()));
  const counts = $derived({
    inventoryAll: dashboard.inventory.length,
    inventoryUnlisted: dashboard.inventory.filter((candidate) => candidate.status === 'unlisted').length,
    inventoryScheduled: dashboard.inventory.filter((candidate) => candidate.status === 'scheduled').length,
    inventoryActive: dashboard.inventory.filter((candidate) => candidate.status === 'active').length,
    inventoryMissing: missingInventory.length,
    soldAll: dashboard.sales.length,
    soldMissingCogs: dashboard.sales.filter((candidate) => candidate.cogsCents == null).length,
    soldUnmatched: dashboard.sales.filter((candidate) => !candidate.inventoryItemId).length
  });

  function percent(value: number) { return `${value.toFixed(1)}%`; }
  function signedMoney(value: number) { return `${value >= 0 ? '+' : '−'}${money(Math.abs(value))}`; }

  async function saveCost(event: SubmitEvent) {
    event.preventDefault();
    if (!sale.inventoryItemId) return;
    const parsed = Number(cost);
    if (!Number.isFinite(parsed) || parsed < 0) {
      costBad = true;
      costMessage = 'Enter a valid purchase cost.';
      return;
    }

    savingCost = true;
    costMessage = null;
    costBad = false;

    const response = await fetch(`/api/inventory/${encodeURIComponent(sale.inventoryItemId)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        purchaseCostCents: Math.round(parsed * 100),
        source: item?.source ?? null,
        storageLocation: item?.location ?? null
      })
    });

    const result = await response.json().catch(() => null) as { error?: string } | null;
    savingCost = false;
    if (!response.ok) {
      costBad = true;
      costMessage = result?.error ?? 'Could not save purchase cost.';
      return;
    }

    costMessage = 'Purchase cost saved. Profit and ROI are now reconciled.';
    await invalidateAll();
  }
</script>

<svelte:head><title>{sale.title} · Sold · Sellquity</title></svelte:head>

<PageChrome active="sold-all" eyebrow="SALE BREAKDOWN" title="Sold item" workspace={dashboard.workspace} connected={dashboard.connected} lastSyncedAt={dashboard.lastSyncedAt} {counts}>
  {#snippet headerActions()}
    <a class="org-button secondary" href="/sold"><ArrowLeft size={15} /> All sold</a>
    {#if item}<a class="org-button secondary" href={`/inventory/${encodeURIComponent(item.id)}`}><Tag size={15} /> Inventory record</a>{/if}
  {/snippet}

  <div class="org-stack">
    <section class="org-grid detail-main">
      <article class="org-card">
        <div class="org-detail-photo">
          <div class="org-detail-photo-frame">
            {#if item?.imageUrl}<img src={item.imageUrl} alt={sale.title} />{:else}<span class="fallback">S</span>{/if}
          </div>
          <div>
            <span class="org-pill sold"><PackageCheck size={11} /> Sold</span>
            <h2 style="margin:10px 0 5px;font-size:1rem;line-height:1.2">{sale.title}</h2>
            <p style="margin:0;color:#617d8b;font-size:.65rem">Order {sale.ebayOrderId}</p>
          </div>
          <div class="org-detail-meta">
            <div class="org-detail-meta-row"><span>Marketplace</span><strong>{sale.marketplaceProvider === 'whatnot' ? 'Whatnot' : 'eBay'}</strong></div>
            <div class="org-detail-meta-row"><span>SKU</span><strong>{item?.sku ?? 'N/A'}</strong></div>
            <div class="org-detail-meta-row"><span>Item ID</span><strong>{sale.ebayItemId ?? 'N/A'}</strong></div>
            <div class="org-detail-meta-row"><span>Condition</span><strong>{item?.conditionName ?? 'N/A'}</strong></div>
            <div class="org-detail-meta-row"><span>Source</span><strong>{item?.source ?? 'N/A'}</strong></div>
            <div class="org-detail-meta-row"><span>Purchase date</span><strong>{item?.purchasedAt ? shortDate(item.purchasedAt) : 'N/A'}</strong></div>
          </div>
        </div>
      </article>

      <div class="org-stack">
        <article class="org-card">
          <div class="org-card-head"><div><span class="org-kicker">ITEM LIFECYCLE</span><h2>From inventory to cash</h2></div><Clock3 size={18} /></div>
          <div class="org-timeline">
            {#if item?.purchasedAt}
              <div class="org-timeline-row"><span class="org-timeline-dot"><ShoppingBag size={13} /></span><div class="org-timeline-copy"><strong>Purchased</strong><small>{shortDate(item.purchasedAt)}</small><p>{item.costCents == null ? 'Purchase cost still missing.' : `Cost basis ${money(item.costCents)}${item.source ? ` · ${item.source}` : ''}.`}</p></div></div>
            {/if}
            {#if item?.listedAt}
              <div class="org-timeline-row"><span class="org-timeline-dot"><Tag size={13} /></span><div class="org-timeline-copy"><strong>Listed</strong><small>{shortDate(item.listedAt)}</small><p>{item.listPriceCents == null ? 'Marketplace listing attached.' : `Asking price ${money(item.listPriceCents)}.`}</p></div></div>
            {/if}
            <div class="org-timeline-row"><span class="org-timeline-dot"><PackageCheck size={13} /></span><div class="org-timeline-copy"><strong>Sold</strong><small>{shortDate(sale.soldAt)}</small><p>Collected {money(gross)} from the buyer, including buyer-paid shipping.</p></div></div>
            <div class="org-timeline-row"><span class="org-timeline-dot"><BadgeDollarSign size={13} /></span><div class="org-timeline-copy"><strong>{sale.cogsCents == null ? 'Profit waiting on COGS' : 'Profit reconciled'}</strong><small>{transactions.length} marketplace ledger row{transactions.length === 1 ? '' : 's'} attached</small><p>{sale.cogsCents == null ? 'Add what you paid for this item to finish margin and ROI.' : `${money(sale.netProfitCents)} net profit · ${percent(sale.margin)} margin.`}</p></div></div>
          </div>
        </article>

        <article class="org-card">
          <div class="org-card-head"><div><span class="org-kicker">MONEY FLOW</span><h2>Exactly where the sale went</h2><p>No hunting across inventory, fees and ledger screens.</p></div><CircleDollarSign size={18} /></div>
          <div class="org-money-flow">
            <div class="org-money-line"><span>Item price</span><strong>{money(sale.salePriceCents)}</strong></div>
            <div class="org-money-line"><span>Buyer-paid shipping</span><strong>{money(sale.shippingChargedCents)}</strong></div>
            <div class="org-money-line subtotal"><span>Gross collected</span><strong>{money(gross)}</strong></div>
            <div class="org-money-line"><span>Marketplace selling fees</span><strong class="org-negative">−{money(sale.sellingFeesCents)}</strong></div>
            <div class="org-money-line"><span>Shipping label</span><strong class="org-negative">−{money(sale.shippingLabelCents)}</strong></div>
            <div class="org-money-line"><span>Refunds / disputes</span><strong class="org-negative">−{money(refundsDisputes)}</strong></div>
            {#if sale.otherAdjustmentsCents !== 0}<div class="org-money-line"><span>Other fees / credits / adjustments</span><strong class:org-positive={sale.otherAdjustmentsCents > 0} class:org-negative={sale.otherAdjustmentsCents < 0}>{signedMoney(sale.otherAdjustmentsCents)}</strong></div>{/if}
            <div class="org-money-line"><span>Cost of goods sold</span><strong class:org-warning={sale.cogsCents == null} class:org-negative={sale.cogsCents != null}>{sale.cogsCents == null ? 'Missing' : `−${money(sale.cogsCents)}`}</strong></div>
            <div class="org-money-line total"><span>{sale.cogsCents == null ? 'Profit before COGS' : 'Net profit'}</span><strong>{money(sale.netProfitCents)}</strong></div>
          </div>
          <div class="org-money-stats">
            <span><small>Margin</small><strong>{percent(sale.margin)}</strong></span>
            <span><small>ROI</small><strong>{sale.roi == null ? '—' : percent(sale.roi)}</strong></span>
            <span><small>Marketplace costs</small><strong>{money(Math.max(0, -sale.pnlAdjustmentsCents))}</strong></span>
          </div>
        </article>
      </div>
    </section>

    {#if sale.cogsCents == null && sale.inventoryItemId}
      <section class="org-card">
        <div class="org-card-head"><div><span class="org-kicker">FINISH THIS SALE</span><h2>Add purchase cost</h2><p>This immediately fixes net profit, margin and ROI everywhere in Sellquity.</p></div></div>
        <form onsubmit={saveCost}>
          <div class="org-form-grid">
            <label class="org-field"><span>What did you pay for this item?</span><input class="org-input" bind:value={cost} inputmode="decimal" placeholder="0.00" required /></label>
          </div>
          {#if costMessage}<p class:bad={costBad} class="org-form-message">{costMessage}</p>{/if}
          <div class="org-form-actions"><button class="org-button primary" disabled={savingCost}>{#if savingCost}Saving…{:else}<Save size={14} /> Save COGS{/if}</button></div>
        </form>
      </section>
    {/if}

    <section class="org-card">
      <div class="org-card-head"><div><span class="org-kicker">DATA CONFIDENCE</span><h2>What Sellquity knows about this sale</h2></div><Check size={18} /></div>
      <div class="org-confidence">
        <div class="org-confidence-row"><span><Check size={13} /> Marketplace order linked</span><strong class="org-positive">complete</strong></div>
        <div class="org-confidence-row"><span><Check size={13} /> Financial transactions attached</span><strong class:org-positive={transactions.length > 0} class:org-warning={transactions.length === 0}>{transactions.length > 0 ? `${transactions.length} rows` : 'pending'}</strong></div>
        <div class="org-confidence-row"><span>{#if sale.cogsCents == null}<Clock3 size={13} />{:else}<Check size={13} />{/if} Purchase cost</span><strong class:org-positive={sale.cogsCents != null} class:org-warning={sale.cogsCents == null}>{sale.cogsCents == null ? 'missing' : 'complete'}</strong></div>
        <div class="org-confidence-row"><span>{#if item}<Check size={13} />{:else}<Clock3 size={13} />{/if} Inventory identity</span><strong class:org-positive={Boolean(item)} class:org-warning={!item}>{item ? 'matched' : 'unmatched'}</strong></div>
      </div>
    </section>

    <section class="org-card">
      <div class="org-card-head"><div><span class="org-kicker">MARKETPLACE LEDGER</span><h2>Transactions behind this sale</h2></div><ReceiptText size={18} /></div>
      {#if transactions.length}
        <div class="org-table-wrap"><table class="org-table"><thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Fee type</th><th class="num">Amount</th></tr></thead><tbody>{#each transactions as transaction}<tr><td>{shortDate(transaction.transactionDate)}</td><td><span class="org-pill">{transaction.category.replace(/_/g, ' ')}</span></td><td>{transaction.description || transaction.transactionType}</td><td>{transaction.feeType || '—'}</td><td class:money-positive={transaction.amountCents > 0} class:money-negative={transaction.amountCents < 0} class="num">{signedMoney(transaction.amountCents)}</td></tr>{/each}</tbody></table></div>
      {:else}
        <div class="org-empty"><strong>No detailed financial rows are attached yet.</strong>The order can exist before the Finances API finishes reconciling it.</div>
      {/if}
    </section>
  </div>
</PageChrome>
