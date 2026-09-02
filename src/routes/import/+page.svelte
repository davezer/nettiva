<script lang="ts">
  type ImportResult = {
    batchId: string;
    rowsSeen: number;
    rowsImported: number;
    ordersImported: number;
    transactionsImported: number;
    sellingFeesImported: number;
    shippingLabelsImported: number;
    payoutsImported: number;
    unallocatedTransactions: number;
  };

  let file = $state<File | null>(null);
  let importing = $state(false);
  let error = $state<string | null>(null);
  let result = $state<ImportResult | null>(null);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (!file || importing) return;

    importing = true;
    error = null;
    result = null;

    const form = new FormData();
    form.set('file', file);

    const response = await fetch('/api/ebay/import-transactions', {
      method: 'POST',
      body: form
    });
    const payload = await response.json() as ImportResult & { error?: string };

    importing = false;
    if (!response.ok) {
      error = payload.error ?? 'Import failed.';
      return;
    }
    result = payload;
  }
</script>

<svelte:head>
  <title>Import eBay Transactions · Nettiva</title>
</svelte:head>

<main class="import-shell">
  <a class="back" href="/">← Back to Nettiva</a>

  <section class="card">
    <span class="eyebrow">NETTIVA · ACCOUNTING</span>
    <h1>Import eBay transactions</h1>
    <p class="intro">
      Upload the Transaction report downloaded from eBay Seller Hub. Re-importing the same
      report is safe: Nettiva uses deterministic transaction IDs instead of blindly duplicating rows.
    </p>

    <form onsubmit={submit}>
      <label class="file-box">
        <strong>eBay Transaction report CSV</strong>
        <span>{file?.name ?? 'Choose the CSV exported from Seller Hub'}</span>
        <input
          type="file"
          accept=".csv,text/csv"
          onchange={(event) => file = event.currentTarget.files?.[0] ?? null}
        />
      </label>

      <button disabled={!file || importing}>
        {importing ? 'Importing…' : 'Import transactions'}
      </button>
    </form>

    {#if error}
      <div class="message error">{error}</div>
    {/if}

    {#if result}
      <div class="message success">
        <strong>Import complete.</strong>
        <div class="stats">
          <span><b>{result.ordersImported}</b> orders</span>
          <span><b>{result.sellingFeesImported}</b> selling fees</span>
          <span><b>{result.shippingLabelsImported}</b> shipping labels</span>
          <span><b>{result.payoutsImported}</b> payouts</span>
        </div>
        {#if result.unallocatedTransactions}
          <p>
            {result.unallocatedTransactions} transaction{result.unallocatedTransactions === 1 ? '' : 's'}
            could not be tied to an order and were retained as account-level adjustments.
          </p>
        {/if}
        <a class="dashboard" href="/">Open dashboard →</a>
      </div>
    {/if}
  </section>
</main>

<style>
  :global(body) {
    margin: 0;
    background: #07111f;
    color: #e8eef7;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  .import-shell {
    min-height: 100vh;
    box-sizing: border-box;
    padding: 48px 24px;
    display: grid;
    align-content: start;
    justify-items: center;
    gap: 18px;
  }
  .back {
    width: min(720px, 100%);
    color: #9fb0c5;
    text-decoration: none;
    font-size: 14px;
  }
  .card {
    width: min(720px, 100%);
    box-sizing: border-box;
    background: #0d1a2b;
    border: 1px solid #1f3047;
    border-radius: 22px;
    padding: 34px;
    box-shadow: 0 24px 70px rgba(0, 0, 0, .28);
  }
  .eyebrow {
    color: #57d6a4;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: .14em;
  }
  h1 {
    margin: 8px 0 10px;
    font-size: clamp(30px, 5vw, 44px);
    letter-spacing: -.035em;
  }
  .intro {
    color: #9fb0c5;
    line-height: 1.65;
    margin-bottom: 28px;
  }
  form {
    display: grid;
    gap: 14px;
  }
  .file-box {
    display: grid;
    gap: 7px;
    padding: 22px;
    border: 1px dashed #35506d;
    border-radius: 16px;
    background: #091523;
    cursor: pointer;
  }
  .file-box span {
    color: #8ea3bb;
    font-size: 14px;
  }
  .file-box input {
    margin-top: 8px;
  }
  button, .dashboard {
    display: inline-flex;
    justify-content: center;
    border: 0;
    border-radius: 12px;
    padding: 13px 18px;
    background: #57d6a4;
    color: #07111f;
    font: inherit;
    font-weight: 800;
    text-decoration: none;
    cursor: pointer;
  }
  button:disabled {
    opacity: .45;
    cursor: not-allowed;
  }
  .message {
    margin-top: 22px;
    padding: 18px;
    border-radius: 14px;
    line-height: 1.5;
  }
  .error {
    border: 1px solid #673239;
    background: #2a151a;
    color: #ffb5bd;
  }
  .success {
    border: 1px solid #235441;
    background: #0b241b;
  }
  .stats {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
    margin: 16px 0;
  }
  .stats span {
    padding: 12px;
    border-radius: 10px;
    background: rgba(255, 255, 255, .05);
    color: #b9c8d8;
    font-size: 13px;
  }
  .stats b {
    display: block;
    color: #fff;
    font-size: 22px;
  }
  .dashboard {
    margin-top: 6px;
  }
  @media (max-width: 640px) {
    .card { padding: 24px; }
    .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
</style>
