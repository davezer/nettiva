import { mkdir, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const DATABASE = 'nettiva';
const WRANGLER_BIN = resolve(
  process.cwd(),
  'node_modules',
  'wrangler',
  'bin',
  'wrangler.js'
);

async function assertWranglerInstalled() {
  try {
    await access(WRANGLER_BIN);
  } catch {
    throw new Error(
      'Local Wrangler CLI was not found. Run `npm install` and try again.'
    );
  }
}

function runWrangler(args) {
  if (args.includes('--remote')) {
    throw new Error('Fresh Start refuses to run any remote D1 command.');
  }

  // Execute Wrangler's JS CLI with the same Node runtime running this script.
  // This avoids Windows .cmd spawning issues from npx/npm wrappers.
  const result = spawnSync(
    process.execPath,
    [WRANGLER_BIN, ...args],
    {
      cwd: process.cwd(),
      stdio: 'inherit',
      shell: false
    }
  );

  if (result.error) throw result.error;

  if (result.status !== 0) {
    throw new Error(
      `Wrangler exited with code ${result.status ?? 'unknown'}.`
    );
  }
}

function timestamp() {
  return new Date()
    .toISOString()
    .replaceAll(':', '-')
    .replaceAll('.', '-');
}

await assertWranglerInstalled();

console.log('');
console.log('SELLQUITY · LOCAL BUSINESS RESET');
console.log('--------------------------------');
console.log('This command CANNOT target remote D1.');
console.log('');
console.log('DELETE from LOCAL:');
console.log('  inventory / listings / orders / sales');
console.log('  accounting / import batches / Whatnot ledger');
console.log('  purchase lots / SKU sequences / reservations');
console.log('  custom categories / non-eBay marketplace metadata');
console.log('');
console.log('KEEP:');
console.log('  login / Better Auth / users');
console.log('  workspace / memberships');
console.log('  migrations / schema');
console.log('  eBay OAuth credentials if present');
console.log('');

const rl = createInterface({ input, output });
const answer = await rl.question('Type RESET to continue: ');
rl.close();

if (answer.trim() !== 'RESET') {
  console.log('');
  console.log('Reset cancelled. Nothing was changed.');
  process.exit(0);
}

const backupDirectory = resolve(process.cwd(), 'backups');
await mkdir(backupDirectory, { recursive: true });

const backupPath = resolve(
  backupDirectory,
  `sellquity-local-before-business-reset-${timestamp()}.sql`
);

console.log('');
console.log('1/2 Exporting LOCAL backup...');
runWrangler([
  'd1',
  'export',
  DATABASE,
  '--local',
  '--output',
  backupPath
]);

console.log('');
console.log('2/2 Resetting LOCAL business data...');
runWrangler([
  'd1',
  'execute',
  DATABASE,
  '--local',
  '--file',
  resolve(process.cwd(), 'scripts/reset-business-data.sql')
]);

console.log('');
console.log('Fresh start complete.');
console.log(`Backup: ${backupPath}`);
console.log('');
console.log('Next:');
console.log('  1. npm run dev');
console.log('  2. Data & Imports → Current active inventory');
console.log('  3. Import eBay Seller Hub → Listings → All active listings');
console.log('  4. Import your eBay Transaction report');
console.log('');
