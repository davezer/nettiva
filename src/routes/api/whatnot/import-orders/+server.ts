import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { importWhatnotWeeklyCsv } from '$lib/server/whatnot-csv-import';
import { currentWorkspaceId } from '$lib/server/workspace';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_TOTAL_SIZE = 25 * 1024 * 1024;
const MAX_FILES = 52;

export const POST: RequestHandler = async ({ request, platform, locals }) => {
  const db = platform?.env.DB;
  if (!db) return json({ error: 'Database binding is unavailable.' }, { status: 500 });

  const workspaceId = currentWorkspaceId(locals);
  const form = await request.formData();
  const uploaded = form
    .getAll('file')
    .filter((value): value is File => typeof value !== 'string');

  if (!uploaded.length) {
    return json({ error: 'Choose one or more Whatnot Weekly Orders Report CSVs first.' }, { status: 400 });
  }

  if (uploaded.length > MAX_FILES) {
    return json({ error: `Import at most ${MAX_FILES} weekly reports at once.` }, { status: 413 });
  }

  const totalSize = uploaded.reduce((sum, file) => sum + file.size, 0);
  if (totalSize > MAX_TOTAL_SIZE) {
    return json({ error: 'Combined CSV upload is larger than 25 MB.' }, { status: 413 });
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
      results.push(await importWhatnotWeeklyCsv(
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
      ordersImported: results.reduce((sum, result) => sum + result.ordersImported, 0),
      transactionsImported: results.reduce((sum, result) => sum + result.transactionsImported, 0),
      feesImported: results.reduce((sum, result) => sum + result.feesImported, 0),
      sellerShippingImported: results.reduce((sum, result) => sum + result.sellerShippingImported, 0),
      inventoryMatched: results.reduce((sum, result) => sum + result.inventoryMatched, 0),
      inventoryCreated: results.reduce((sum, result) => sum + result.inventoryCreated, 0),
      skuConflicts: results.reduce((sum, result) => sum + result.skuConflicts, 0),
      giveaways: results.reduce((sum, result) => sum + result.giveaways, 0),
      unreconciledRows: results.reduce((sum, result) => sum + result.unreconciledRows, 0)
    });
  } catch (error) {
    console.error('Whatnot Weekly Orders CSV import failed', error);
    return json(
      { error: error instanceof Error ? error.message : 'The Whatnot import failed.' },
      { status: 400 }
    );
  }
};
