import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { authEmailMode } from '$lib/server/email';

function localHost(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

type MailRow = {
  id: string;
  recipient: string;
  kind: string;
  subject: string;
  actionUrl: string;
  createdAt: string;
};

export const load: PageServerLoad = async ({ platform, url }) => {
  if (!platform || !localHost(url.hostname) || authEmailMode(platform.env) !== 'outbox') {
    error(404, 'Local auth mailbox is unavailable.');
  }

  const result = await platform.env.DB.prepare(`
    SELECT
      id,
      recipient,
      kind,
      subject,
      action_url AS actionUrl,
      created_at AS createdAt
    FROM auth_email_outbox
    ORDER BY created_at DESC
    LIMIT 50
  `).all<MailRow>();

  return { messages: result.results };
};
