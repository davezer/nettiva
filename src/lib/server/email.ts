type NettivaEnv = App.Platform['env'];

export type AuthEmailKind =
  | 'verify-email'
  | 'reset-password'
  | 'change-email-current'
  | 'change-email-new';

export type AuthEmailMessage = {
  authUserId?: string | null;
  to: string;
  kind: AuthEmailKind;
  subject: string;
  actionUrl: string;
  intro: string;
  buttonLabel: string;
};

export type AuthEmailMode = 'outbox' | 'resend' | 'disabled';

function looksLocal(value?: string | null) {
  const normalized = value?.toLowerCase() ?? '';
  return (
    normalized.includes('localhost') ||
    normalized.includes('127.0.0.1') ||
    normalized.includes('[::1]')
  );
}

export function authEmailMode(env: NettivaEnv): AuthEmailMode {
  const configured = env.NETTIVA_AUTH_EMAIL_MODE?.trim().toLowerCase();
  if (configured === 'outbox' || configured === 'resend' || configured === 'disabled') {
    return configured;
  }

  // Frictionless local default; fail closed everywhere else.
  return looksLocal(env.BETTER_AUTH_URL) ? 'outbox' : 'disabled';
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function emailHtml(message: AuthEmailMessage) {
  const actionUrl = escapeHtml(message.actionUrl);
  const intro = escapeHtml(message.intro);
  const label = escapeHtml(message.buttonLabel);

  return `<!doctype html>
<html>
  <body style="margin:0;background:#080c10;color:#e7eee8;font-family:Arial,sans-serif">
    <div style="max-width:560px;margin:0 auto;padding:40px 24px">
      <div style="font-weight:900;letter-spacing:.14em;color:#b8f34a">NETTIVA</div>
      <h1 style="font-size:24px;margin:24px 0 10px">${escapeHtml(message.subject)}</h1>
      <p style="color:#9aa7b2;line-height:1.6">${intro}</p>
      <p style="margin:28px 0">
        <a href="${actionUrl}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#b8f34a;color:#091006;text-decoration:none;font-weight:800">${label}</a>
      </p>
      <p style="color:#697681;font-size:12px;line-height:1.6">If the button does not work, paste this link into your browser:<br>${actionUrl}</p>
    </div>
  </body>
</html>`;
}

async function writeOutbox(env: NettivaEnv, message: AuthEmailMessage) {
  await env.DB.prepare(`
    INSERT INTO auth_email_outbox (
      id, auth_user_id, recipient, kind, subject, action_url, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(),
    message.authUserId ?? null,
    message.to.toLowerCase(),
    message.kind,
    message.subject,
    message.actionUrl,
    new Date().toISOString()
  ).run();
}

async function sendWithResend(env: NettivaEnv, message: AuthEmailMessage) {
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.NETTIVA_AUTH_EMAIL_FROM?.trim();

  if (!apiKey || !from) {
    throw new Error(
      'Resend email mode requires RESEND_API_KEY and NETTIVA_AUTH_EMAIL_FROM.'
    );
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      'idempotency-key': `nettiva-${message.kind}-${crypto.randomUUID()}`
    },
    body: JSON.stringify({
      from,
      to: [message.to],
      subject: message.subject,
      html: emailHtml(message),
      text: `${message.intro}\n\n${message.actionUrl}`,
      tags: [{ name: 'category', value: message.kind.replaceAll('-', '_') }]
    })
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Transactional email failed (${response.status}): ${body.slice(0, 240)}`);
  }
}

export async function sendAuthEmail(env: NettivaEnv, message: AuthEmailMessage) {
  const mode = authEmailMode(env);

  if (mode === 'outbox') {
    await writeOutbox(env, message);
    return;
  }

  if (mode === 'resend') {
    await sendWithResend(env, message);
    return;
  }

  throw new Error(
    'Authentication email delivery is disabled. Configure NETTIVA_AUTH_EMAIL_MODE.'
  );
}

export function queueAuthEmail(
  env: NettivaEnv,
  context: ExecutionContext | undefined,
  message: AuthEmailMessage
) {
  const task = sendAuthEmail(env, message).catch((error) => {
    console.error(`Nettiva auth email failed (${message.kind})`, error);
  });

  if (context) context.waitUntil(task);
  else void task;
}
