import type { Handle } from '@sveltejs/kit';
import { dev } from '$app/environment';
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
  // `npm run dev` has no Cloudflare platform binding, so local development
  // remains frictionless. Every deployed Worker request is protected.
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
