import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

type SupportBody = {
  email?: unknown;
  category?: unknown;
  subject?: unknown;
  message?: unknown;
  website?: unknown;
};

function clean(value: unknown, max: number) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export const POST: RequestHandler = async ({ platform, request, locals }) => {
  if (!platform) {
    return json({ error: 'Support is temporarily unavailable.' }, { status: 503 });
  }

  const body = await request.json().catch(() => null) as SupportBody | null;
  if (!body) return json({ error: 'Support request details are required.' }, { status: 400 });

  // Honeypot. Real users never see or fill this field.
  if (clean(body.website, 200)) {
    return json({ ok: true });
  }

  const email = clean(body.email, 320).toLowerCase();
  const category = clean(body.category, 40) || 'general';
  const subject = clean(body.subject, 140);
  const message = clean(body.message, 4000);

  if (!validEmail(email)) {
    return json({ error: 'Enter a valid email address.' }, { status: 400 });
  }
  if (subject.length < 3) {
    return json({ error: 'Add a short subject.' }, { status: 400 });
  }
  if (message.length < 10) {
    return json({ error: 'Tell us a little more about what you need help with.' }, { status: 400 });
  }

  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const recent = await platform.env.DB.prepare(`
    SELECT COUNT(*) AS count
    FROM support_requests
    WHERE email = ?
      AND created_at >= ?
  `).bind(email, cutoff).first<{ count: number | null }>();

  if (Number(recent?.count ?? 0) >= 5) {
    return json({ error: 'Too many support requests were sent recently. Try again later.' }, { status: 429 });
  }

  const id = `support:${crypto.randomUUID()}`;
  const now = new Date().toISOString();

  await platform.env.DB.prepare(`
    INSERT INTO support_requests (
      id, auth_user_id, app_user_id, workspace_id,
      email, category, subject, message, status, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
  `).bind(
    id,
    locals.authUserId,
    locals.userId,
    locals.workspaceId,
    email,
    category,
    subject,
    message,
    now,
    now
  ).run();

  return json({ ok: true, id });
};
