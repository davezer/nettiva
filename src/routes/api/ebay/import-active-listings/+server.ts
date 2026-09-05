import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { importEbayActiveListingsCsv } from '$lib/server/ebay-active-listings-import';
import { currentWorkspaceId } from '$lib/server/workspace';

const MAX_BYTES = 12 * 1024 * 1024;

export const POST: RequestHandler = async ({ platform, request, locals }) => {
  if (!platform) {
    return json({ error: 'Cloudflare runtime is unavailable.' }, { status: 503 });
  }

  const form = await request.formData();
  const file = form.get('file');

  if (!(file instanceof File)) {
    return json({ error: 'Choose an eBay active listings CSV.' }, { status: 400 });
  }

  if (!file.name.toLowerCase().endsWith('.csv')) {
    return json({ error: 'The active listings importer accepts CSV files only.' }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return json({ error: 'This CSV is larger than 12 MB.' }, { status: 413 });
  }

  try {
    const workspaceId = currentWorkspaceId(locals);
    const result = await importEbayActiveListingsCsv(
      platform.env.DB,
      await file.text(),
      file.name,
      workspaceId
    );

    return json(result);
  } catch (error) {
    return json(
      {
        error: error instanceof Error
          ? error.message
          : 'Could not import this active listings report.'
      },
      { status: 400 }
    );
  }
};
