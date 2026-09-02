import fs from 'node:fs';

const file = 'src/routes/+page.svelte';
const original = fs.readFileSync(file, 'utf8');
const newline = original.includes('\r\n') ? '\r\n' : '\n';
let source = original.replace(/\r\n/g, '\n');

function log(label, status) {
  console.log(`${status} ${label}`);
}

function replaceLiteral(before, after, label, required = false) {
  if (source.includes(after)) {
    log(label, '✓');
    return true;
  }

  if (!source.includes(before)) {
    if (required) {
      throw new Error(`Could not apply required patch: ${label}`);
    }
    log(`${label} — current UI differs; safely skipped`, '•');
    return false;
  }

  source = source.replace(before, after);
  log(label, '✓');
  return true;
}

function replaceRegex(pattern, replacement, label, required = false) {
  if (pattern.test(source)) {
    source = source.replace(pattern, replacement);
    log(label, '✓');
    return true;
  }

  if (required) {
    throw new Error(`Could not apply required patch: ${label}`);
  }

  log(`${label} — current UI differs; safely skipped`, '•');
  return false;
}

// REQUIRED: account-level expenses/credits must affect total profit.
// Safe on reruns.
if (source.includes(
  "const profit = data.sales.reduce((sum, sale) => sum + sale.netProfitCents, 0) + (data.unallocatedNetCents ?? 0);"
)) {
  log('account-level P&L adjustment already applied', '✓');
} else {
  replaceRegex(
    /const profit = data\.sales\.reduce\(\(sum, sale\) => sum \+ sale\.netProfitCents, 0\);/,
    "const profit = data.sales.reduce((sum, sale) => sum + sale.netProfitCents, 0) + (data.unallocatedNetCents ?? 0);",
    'account-level P&L adjustment',
    true
  );
}

// OPTIONAL: sidebar wording for CSV-only workspace.
// Patch each expression separately so formatting changes do not matter.
if (source.includes(
  "{data.isDemo ? 'Demo workspace' : data.connected ? 'eBay connected' : 'CSV workspace'}"
)) {
  log('CSV workspace status already applied', '✓');
} else {
  replaceRegex(
    /\{data\.connected\s*\?\s*'eBay connected'\s*:\s*'Demo workspace'\}/,
    "{data.isDemo ? 'Demo workspace' : data.connected ? 'eBay connected' : 'CSV workspace'}",
    'CSV workspace status'
  );
}

if (source.includes(
  "{data.lastSyncedAt ? `Synced ${shortDate(data.lastSyncedAt)}` : data.isDemo ? 'Read-only mode' : 'CSV import active'}"
)) {
  log('CSV workspace substatus already applied', '✓');
} else {
  replaceRegex(
    /\{data\.lastSyncedAt\s*\?\s*`Synced \$\{shortDate\(data\.lastSyncedAt\)\}`\s*:\s*'Read-only mode'\}/,
    "{data.lastSyncedAt ? `Synced ${shortDate(data.lastSyncedAt)}` : data.isDemo ? 'Read-only mode' : 'CSV import active'}",
    'CSV workspace substatus'
  );
}

// OPTIONAL: add a CSV import button to Settings.
// If the page already has /import anywhere, don't add another one.
if (source.includes('href="/import"')) {
  log('CSV import button already present', '✓');
} else {
  const connectLink =
    '<a class="button primary" href="/api/ebay/connect"><ExternalLink size={17} /> Connect eBay securely</a>';

  if (source.includes(connectLink)) {
    source = source.replace(
      connectLink,
      `${connectLink}\n          <a class="button secondary" href="/import">Import eBay CSV</a>`
    );
    log('CSV import button', '✓');
  } else {
    log('CSV import button — current UI differs; safely skipped (use /import directly)', '•');
  }
}

// OPTIONAL: clarify sales table cost label.
replaceLiteral(
  '<th class="num">Gross</th><th class="num">Fees</th><th class="num">COGS</th>',
  '<th class="num">Gross</th><th class="num">Fees + ship</th><th class="num">COGS</th>',
  'sales cost header'
);

// Restore original line-ending style.
const output = newline === '\r\n' ? source.replace(/\n/g, '\r\n') : source;
fs.writeFileSync(file, output, 'utf8');

console.log('');
console.log('✓ Nettiva transaction UI patch complete.');
console.log('  Optional UI items may be skipped when your local page has newer/custom markup.');
console.log('  The CSV importer is still available at /import.');
