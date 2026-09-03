import type { Handle } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { DEFAULT_USER_ID, DEFAULT_WORKSPACE_ID } from '$lib/server/workspace';

function challenge(message = 'Authentication required.') {
  return new Response(message, {
    status: 401,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'text/plain; charset=utf-8',
      'www-authenticate': 'Basic realm="Nettiva", charset="UTF-8"'
    }
  });
}

function readBasicCredentials(header: string | null) {
  if (!header?.startsWith('Basic ')) return null;

  try {
    const decoded = atob(header.slice(6));
    const separator = decoded.indexOf(':');
    if (separator < 0) return null;

    return {
      username: decoded.slice(0, separator),
      password: decoded.slice(separator + 1)
    };
  } catch {
    return null;
  }
}

export const handle: Handle = async ({ event, resolve }) => {
  // Accounts & Workspaces v1 deliberately keeps the existing auth gate.
  // Real session auth will replace only this context assignment later.
  event.locals.userId = DEFAULT_USER_ID;
  event.locals.workspaceId = DEFAULT_WORKSPACE_ID;
  event.locals.workspaceRole = 'owner';

  // `npm run dev` remains frictionless. Every deployed Worker request keeps
  // the existing Basic Auth protection until consumer auth is introduced.
  if (dev || !event.platform) return resolve(event);

  const username = event.platform.env.NETTIVA_USERNAME;
  const password = event.platform.env.NETTIVA_PASSWORD;

  if (!username || !password) {
    return new Response('Nettiva access credentials are not configured.', {
      status: 503,
      headers: {
        'cache-control': 'no-store',
        'content-type': 'text/plain; charset=utf-8'
      }
    });
  }

  const supplied = readBasicCredentials(event.request.headers.get('authorization'));
  if (!supplied || supplied.username !== username || supplied.password !== password) {
    return challenge();
  }

  return resolve(event);
};
