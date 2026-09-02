import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { importEbayTransactionCsv } from '$lib/server/ebay-csv-import';

const MAX_FILE_SIZE = 10 * 1024 * 1024;

export const POST: RequestHandler = async ({ request, platform }) => {
  const db = platform?.env.DB;
  if (!db) return json({ error: 'Database binding is unavailable.' }, { status: 500 });

  const form = await request.formData();
  const uploaded = form.get('file');

  if (!uploaded || typeof uploaded === 'string') {
    return json({ error: 'Choose an eBay transaction CSV first.' }, { status: 400 });
  }

  if (uploaded.size > MAX_FILE_SIZE) {
    return json({ error: 'CSV is larger than 10 MB.' }, { status: 413 });
  }

  if (!uploaded.name.toLowerCase().endsWith('.csv')) {
    return json({ error: 'Please upload a .csv file.' }, { status: 400 });
  }

  try {
    const result = await importEbayTransactionCsv(db, await uploaded.text(), uploaded.name);
    return json(result);
  } catch (error) {
    console.error('eBay CSV import failed', error);
    return json(
      { error: error instanceof Error ? error.message : 'The CSV import failed.' },
      { status: 400 }
    );
  }
};
