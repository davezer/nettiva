import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { currentWorkspaceId } from '$lib/server/workspace';
import { importWhatnotLedgerCsv } from '$lib/server/whatnot-ledger-import';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_FILES = 20;

export const POST: RequestHandler = async ({ request, platform, locals }) => {
  const db = platform?.env.DB;
  if (!db) return json({ error: 'Database binding is unavailable.' }, { status: 500 });

  const workspaceId = currentWorkspaceId(locals);
  const form = await request.formData();
  const uploaded = form
    .getAll('file')
    .filter((value): value is File => typeof value !== 'string');

  if (!uploaded.length) {
    return json({ error: 'Choose one or more Whatnot Ledger CSV files first.' }, { status: 400 });
  }

  if (uploaded.length > MAX_FILES) {
    return json({ error: `Import at most ${MAX_FILES} ledger exports at once.` }, { status: 413 });
  }

  for (const file of uploaded) {
    if (file.size > MAX_FILE_SIZE) {
      return json({ error: `${file.name} is larger than 10 MB.` }, { status: 413 });
    }
    if (!file.name.toLowerCase().endsWith('.csv')) {
      return json({ error: `${file.name} is not a .csv file.` }, { status: 400 });
    }
  }

  try {
    const results = [];
    for (const file of uploaded) {
      results.push(await importWhatnotLedgerCsv(
        db,
        await file.text(),
        file.name,
        workspaceId
      ));
    }

    return json({
      batchIds: results.map((result) => result.batchId),
      filesImported: results.length,
      rowsSeen: results.reduce((sum, result) => sum + result.rowsSeen, 0),
      rowsImported: results.reduce((sum, result) => sum + result.rowsImported, 0),
      completedRows: results.reduce((sum, result) => sum + result.completedRows, 0),
      pendingRows: results.reduce((sum, result) => sum + result.pendingRows, 0),
      salesEntries: results.reduce((sum, result) => sum + result.salesEntries, 0),
      tipEntries: results.reduce((sum, result) => sum + result.tipEntries, 0),
      payoutEntries: results.reduce((sum, result) => sum + result.payoutEntries, 0),
      salesEarningsCents: results.reduce((sum, result) => sum + result.salesEarningsCents, 0),
      tipIncomeCents: results.reduce((sum, result) => sum + result.tipIncomeCents, 0),
      payoutCents: results.reduce((sum, result) => sum + result.payoutCents, 0),
      netBalanceChangeCents: results.reduce((sum, result) => sum + result.netBalanceChangeCents, 0)
    });
  } catch (error) {
    console.error('Whatnot Ledger CSV import failed', error);
    return json(
      { error: error instanceof Error ? error.message : 'The Whatnot Ledger import failed.' },
      { status: 400 }
    );
  }
};
