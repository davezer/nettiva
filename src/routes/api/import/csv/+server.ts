import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { parseEbayCsv } from '$lib/server/ebay-csv';

const MAX_FILE_BYTES = 20 * 1024 * 1024;

export const POST: RequestHandler = async ({ platform, request, url }) => {
  if (!platform) return json({ error: 'Cloudflare D1 is unavailable.' }, { status: 503 });

  const form = await request.formData();
  const file = form.get('report');

  if (!(file instanceof File)) {
    return json({ error: 'Choose an eBay CSV report first.' }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return json({ error: 'CSV reports must be 20 MB or smaller.' }, { status: 413 });
  }

  try {
    const raw = await file.text();
    const parsed = parseEbayCsv(raw);
    const preview = {
      filename: file.name,
      type: parsed.type,
      rowsSeen: parsed.rowsSeen,
      validRows: parsed.validRows,
      skippedRows: parsed.skippedRows,
      warnings: parsed.warnings
    };

    if (url.searchParams.get('mode') !== 'commit') return json({ preview });

    return json({
      error: 'This legacy CSV route is preview-only. Use the Transaction History importer for committed eBay transaction data.'
    }, { status: 400 });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : 'Could not read this CSV report.' },
      { status: 400 }
    );
  }
};
