<script lang="ts">
  import {
    ArrowLeft,
    Check,
    CircleDollarSign,
    Download,
    Info,
    Search,
    WalletCards
  } from '@lucide/svelte';

  type Entry = {
    id: string;
    externalKey: string;
    transactionType: string;
    status: string;
    amountCents: number;
    currency: string;
    createdAtExternal: string;
    completedAtExternal: string | null;
    externalOrderId: string | null;
    externalListingId: string | null;
    description: string | null;
    matchedOrderReport: boolean;
  };

  type PageData = {
    workspace: {
      id: string;
      name: string;
      slug: string;
      plan: string;
      role: 'owner' | 'admin' | 'member';
    } | null;
    entries: Entry[];
  };

  let { data } = $props<{ data: PageData }>();

  let query = $state('');
  let typeFilter = $state<'all' | 'SALES' | 'TIP' | 'PAYOUT'>('all');

  function money(cents: number) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(cents / 100);
  }

  function signedMoney(cents: number) {
    if (cents === 0) return money(0);
    return `${cents > 0 ? '+' : '−'}${money(Math.abs(cents))}`;
  }

  function ledgerDate(value: string | null) {
    if (!value) return '—';
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return value;
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }).format(date);
  }

  const completed = $derived(data.entries.filter((entry: Entry) => entry.status === 'completed'));

  const salesEarnings = $derived(
    completed
      .filter((entry: Entry) => entry.transactionType === 'SALES')
      .reduce((sum: number, entry: Entry) => sum + entry.amountCents, 0)
  );

  const tipIncome = $derived(
    completed
      .filter((entry: Entry) => entry.transactionType === 'TIP')
      .reduce((sum: number, entry: Entry) => sum + entry.amountCents, 0)
  );

  const payouts = $derived(
    completed
      .filter((entry: Entry) => entry.transactionType === 'PAYOUT')
      .reduce((sum: number, entry: Entry) => sum + Math.abs(entry.amountCents), 0)
  );

  const netBalanceChange = $derived(
    completed.reduce((sum: number, entry: Entry) => sum + entry.amountCents, 0)
  );

  const salesCount = $derived(
    completed.filter((entry: Entry) => entry.transactionType === 'SALES').length
  );

  const matchedSales = $derived(
    completed.filter((entry: Entry) => entry.transactionType === 'SALES' && entry.matchedOrderReport).length
  );

  const filtered = $derived.by(() => {
    const needle = query.trim().toLowerCase();

    return data.entries.filter((entry: Entry) => {
      if (typeFilter !== 'all' && entry.transactionType !== typeFilter) return false;
      if (!needle) return true;

      return [
        entry.transactionType,
        entry.description ?? '',
        entry.externalOrderId ?? '',
        entry.externalListingId ?? '',
        entry.status
      ].join(' ').toLowerCase().includes(needle);
    });
  });
</script>

<svelte:head>
  <title>Whatnot reconciliation · Sellquity</title>
  <meta name="robots" content="noindex,nofollow" />
</svelte:head>

<div class="recon-shell">
  <header class="topbar">
    <a href="/" class="back"><ArrowLeft size={16} /> Sellquity</a>
    <div class="workspace">
      <span>WORKSPACE</span>
      <strong>{data.workspace?.name ?? 'Sellquity'}</strong>
    </div>
  </header>

  <main>
    <section class="hero">
      <div>
        <span class="eyebrow">WHATNOT RECONCILIATION</span>
        <h1>Follow the actual balance.</h1>
        <p>
          Weekly Orders Reports explain profit. The Whatnot Ledger explains what actually moved
          through your marketplace balance. Sellquity keeps those two jobs separate so revenue is
          never counted twice.
        </p>
      </div>

      <a class="import-link" href="/import"><Download size={16} /> Import another ledger</a>
    </section>

    <section class="metrics">
      <article>
        <CircleDollarSign size={18} />
        <span><small>Sales earnings</small><strong>{money(salesEarnings)}</strong></span>
      </article>
      <article>
        <CircleDollarSign size={18} />
        <span><small>Tip income</small><strong>{money(tipIncome)}</strong></span>
      </article>
      <article>
        <WalletCards size={18} />
        <span><small>Payouts</small><strong>{money(payouts)}</strong></span>
      </article>
      <article class:negative={netBalanceChange < 0}>
        <WalletCards size={18} />
        <span><small>Net balance change</small><strong>{signedMoney(netBalanceChange)}</strong></span>
      </article>
    </section>

    <section class="recon-note">
      <Info size={17} />
      <span>
        <strong>{matchedSales} of {salesCount} Ledger sales matched to a Weekly Orders Report.</strong>
        Unmatched Ledger SALES rows are balance evidence only—they do not create gross revenue or
        fees in P&amp;L.
      </span>
    </section>

    <section class="toolbar">
      <label class="search">
        <Search size={16} />
        <input bind:value={query} placeholder="Search message, order, listing…" />
      </label>

      <div class="tabs">
        <button class:active={typeFilter === 'all'} onclick={() => typeFilter = 'all'}>All</button>
        <button class:active={typeFilter === 'SALES'} onclick={() => typeFilter = 'SALES'}>Sales</button>
        <button class:active={typeFilter === 'TIP'} onclick={() => typeFilter = 'TIP'}>Tips</button>
        <button class:active={typeFilter === 'PAYOUT'} onclick={() => typeFilter = 'PAYOUT'}>Payouts</button>
      </div>
    </section>

    <section class="ledger-card">
      <div class="ledger-head">
        <div>
          <span class="eyebrow">BALANCE LEDGER</span>
          <h2>{filtered.length} entr{filtered.length === 1 ? 'y' : 'ies'}</h2>
        </div>
        <span>{completed.length} completed</span>
      </div>

      {#if filtered.length}
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Completed</th>
                <th>Type</th>
                <th>Description</th>
                <th>Order</th>
                <th class="num">Amount</th>
                <th>Accounting</th>
              </tr>
            </thead>
            <tbody>
              {#each filtered as entry}
                <tr>
                  <td>{ledgerDate(entry.completedAtExternal ?? entry.createdAtExternal)}</td>
                  <td>
                    <span
                      class:sales={entry.transactionType === 'SALES'}
                      class:tip={entry.transactionType === 'TIP'}
                      class:payout={entry.transactionType === 'PAYOUT'}
                      class="type-pill"
                    >{entry.transactionType}</span>
                  </td>
                  <td class="description">
                    <strong>{entry.description ?? 'Whatnot ledger entry'}</strong>
                    {#if entry.externalListingId}<small>Listing {entry.externalListingId}</small>{/if}
                  </td>
                  <td>{entry.externalOrderId ?? '—'}</td>
                  <td class:credit={entry.amountCents > 0} class:debit={entry.amountCents < 0} class="num amount">
                    {signedMoney(entry.amountCents)}
                  </td>
                  <td>
                    {#if entry.status !== 'completed'}
                      <span class="status pending">Pending</span>
                    {:else if entry.transactionType === 'SALES' && entry.matchedOrderReport}
                      <span class="status matched"><Check size={12} /> Matched</span>
                    {:else if entry.transactionType === 'SALES'}
                      <span class="status waiting">Needs orders report</span>
                    {:else if entry.transactionType === 'TIP'}
                      <span class="status income">P&amp;L income</span>
                    {:else if entry.transactionType === 'PAYOUT'}
                      <span class="status excluded">Excluded from P&amp;L</span>
                    {:else}
                      <span class="status excluded">Balance only</span>
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {:else}
        <div class="empty">
          <strong>No ledger entries match this view.</strong>
          <span>Try a different filter or import a Whatnot Ledger CSV.</span>
        </div>
      {/if}
    </section>
  </main>
</div>

<style>
  :global(body) {
    margin: 0;
    background: #080d12;
    color: #e8eee9;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  * { box-sizing: border-box; }

  .recon-shell { min-height: 100vh; background: #080d12; }

  .topbar {
    height: 62px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 max(24px, calc((100vw - 1180px) / 2));
    border-bottom: 1px solid #202a33;
    background: #0b1117;
  }

  .back {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    color: #9aa8b3;
    text-decoration: none;
    font-size: .78rem;
    font-weight: 800;
  }

  .back:hover { color: #01d4a5; }

  .workspace {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
  }

  .workspace span,
  .eyebrow {
    color: #788591;
    font: 800 .63rem "SFMono-Regular", Consolas, monospace;
    letter-spacing: .13em;
  }

  .workspace strong { font-size: .76rem; }

  main {
    width: min(1180px, calc(100% - 40px));
    margin: 0 auto;
    padding: 48px 0 80px;
  }

  .hero {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 30px;
    margin-bottom: 24px;
  }

  h1 {
    margin: 8px 0 10px;
    font-size: clamp(2.2rem, 5vw, 3.8rem);
    line-height: .98;
    letter-spacing: -.045em;
  }

  .hero p {
    max-width: 760px;
    margin: 0;
    color: #7f8c97;
    font-size: .84rem;
    line-height: 1.65;
  }

  .import-link {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-height: 38px;
    border-radius: 9px;
    padding: 0 13px;
    color: #03131a;
    background: #01d4a5;
    text-decoration: none;
    font-size: .72rem;
    font-weight: 900;
  }

  .metrics {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    border: 1px solid #293640;
    border-radius: 13px;
    overflow: hidden;
    background: #0e151c;
  }

  .metrics article {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 16px;
    border-right: 1px solid #293640;
  }

  .metrics article:last-child { border-right: 0; }
  .metrics article > :global(svg) { color: #01d4a5; }

  .metrics span {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .metrics small { color: #697681; font-size: .63rem; }
  .metrics strong { overflow: hidden; font-size: .94rem; text-overflow: ellipsis; }
  .metrics .negative strong { color: #d99196; }

  .recon-note {
    display: flex;
    align-items: flex-start;
    gap: 9px;
    margin: 14px 0;
    border: 1px solid #33422b;
    border-radius: 10px;
    padding: 11px 12px;
    color: #7e8d80;
    background: #081821;
    font-size: .72rem;
    line-height: 1.5;
  }

  .recon-note > :global(svg) { flex: 0 0 auto; color: #01d0e9; }
  .recon-note strong { color: #b8c7b9; }

  .toolbar {
    display: grid;
    grid-template-columns: minmax(240px, 1fr) auto;
    gap: 11px;
    margin-bottom: 14px;
  }

  .search {
    position: relative;
    display: flex;
    align-items: center;
  }

  .search > :global(svg) {
    position: absolute;
    left: 12px;
    color: #61707b;
  }

  .search input {
    width: 100%;
    height: 40px;
    border: 1px solid #2d3943;
    border-radius: 9px;
    padding: 0 12px 0 37px;
    outline: 0;
    color: #e6ede8;
    background: #0d141a;
  }

  .search input:focus { border-color: #11698a; }

  .tabs {
    display: flex;
    gap: 4px;
    border: 1px solid #2d3943;
    border-radius: 9px;
    padding: 4px;
    background: #0d141a;
  }

  .tabs button {
    border: 0;
    border-radius: 6px;
    padding: 0 12px;
    color: #7e8b95;
    background: transparent;
    font: inherit;
    font-size: .68rem;
    font-weight: 800;
    cursor: pointer;
  }

  .tabs button.active {
    color: #03131a;
    background: #01d4a5;
  }

  .ledger-card {
    border: 1px solid #293640;
    border-radius: 14px;
    overflow: hidden;
    background: #0e151c;
  }

  .ledger-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    padding: 18px 20px;
    border-bottom: 1px solid #27323b;
  }

  .ledger-head h2 { margin: 3px 0 0; font-size: 1rem; }
  .ledger-head > span { color: #6d7a85; font-size: .67rem; }

  .table-wrap { overflow-x: auto; }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  th, td {
    padding: 11px 13px;
    border-bottom: 1px solid #222d36;
    text-align: left;
    font-size: .72rem;
  }

  th {
    color: #6e7b86;
    background: #0b1117;
    font-size: .61rem;
    text-transform: uppercase;
    letter-spacing: .07em;
  }

  tbody tr:last-child td { border-bottom: 0; }

  .description strong {
    display: block;
    max-width: 400px;
    overflow: hidden;
    color: #dbe4de;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .description small {
    display: block;
    margin-top: 3px;
    color: #65727d;
  }

  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .amount { font-weight: 850; }
  .credit { color: #01d4a5; }
  .debit { color: #d69095; }

  .type-pill,
  .status {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    border-radius: 999px;
    padding: 4px 7px;
    font: 800 .59rem "SFMono-Regular", Consolas, monospace;
    text-transform: uppercase;
  }

  .type-pill { color: #aeb9c1; background: #202a33; }
  .type-pill.sales { color: #01d4a5; background: #0c2730; }
  .type-pill.tip { color: #66d9ff; background: #122832; }
  .type-pill.payout { color: #c3a6dd; background: #282033; }

  .status { text-transform: none; }
  .status.matched { color: #55ead2; background: #0b2830; }
  .status.waiting { color: #e3bd72; background: #2b2314; }
  .status.income { color: #6ed5f4; background: #142b33; }
  .status.excluded { color: #8d99a4; background: #202832; }
  .status.pending { color: #e6ae62; background: #302313; }

  .empty {
    min-height: 220px;
    display: grid;
    place-items: center;
    align-content: center;
    gap: 7px;
    color: #697681;
    text-align: center;
  }

  .empty strong { color: #cbd5cf; }

  @media (max-width: 840px) {
    .hero { align-items: flex-start; flex-direction: column; }
    .metrics { grid-template-columns: 1fr 1fr; }
    .metrics article:nth-child(2) { border-right: 0; }
    .metrics article:nth-child(-n+2) { border-bottom: 1px solid #293640; }
    .toolbar { grid-template-columns: 1fr; }
    .tabs button { min-height: 34px; }
  }

  @media (max-width: 560px) {
    main { width: min(100% - 24px, 1180px); padding-top: 30px; }
    .topbar { padding: 0 14px; }
    .metrics { grid-template-columns: 1fr; }
    .metrics article { border-right: 0; border-bottom: 1px solid #293640; }
    .metrics article:last-child { border-bottom: 0; }
    .tabs { overflow-x: auto; }
  }
</style>
