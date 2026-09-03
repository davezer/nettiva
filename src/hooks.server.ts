import type { Handle } from '@sveltejs/kit';
import { building } from '$app/environment';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { createAuth } from '$lib/server/auth';
import { resolveTenantForAuthUser } from '$lib/server/workspace';

const PUBLIC_PATHS = new Set([
  '/login',
  '/favicon.ico',
  '/robots.txt'
]);

function isAuthPath(pathname: string) {
  return pathname === '/api/auth' || pathname.startsWith('/api/auth/');
}

function isPublicPath(pathname: string) {
  return (
    PUBLIC_PATHS.has(pathname) ||
    pathname.startsWith('/_app/') ||
    isAuthPath(pathname)
  );
}

function unauthorizedApi() {
  return Response.json(
    { error: 'Authentication required.' },
    { status: 401, headers: { 'cache-control': 'no-store' } }
  );
}

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.authUserId = null;
  event.locals.authName = null;
  event.locals.authEmail = null;
  event.locals.userId = null;
  event.locals.workspaceId = null;
  event.locals.workspaceRole = null;

  if (building) return resolve(event);

  const pathname = event.url.pathname;
  const publicPath = isPublicPath(pathname);

  if (!event.platform) {
    if (publicPath) return resolve(event);

    return new Response(
      'Cloudflare runtime bindings are unavailable. Nettiva auth requires the local D1 runtime.',
      { status: 503 }
    );
  }

  const secret = event.platform.env.BETTER_AUTH_SECRET?.trim();
  if (!secret) {
    if (publicPath) return resolve(event);

    return new Response(
      'Nettiva auth is not configured. Add BETTER_AUTH_SECRET to .dev.vars.',
      { status: 503 }
    );
  }

  const auth = createAuth(event.platform.env, event.url.origin);

  // Better Auth's official SvelteKit handler owns all /api/auth/* requests.
  if (isAuthPath(pathname)) {
    return svelteKitHandler({ event, resolve, auth, building });
  }

  let session: Awaited<ReturnType<typeof auth.api.getSession>> = null;

  try {
    session = await auth.api.getSession({
      headers: event.request.headers
    });
  } catch (error) {
    console.error('Nettiva session lookup failed', error);
  }

  if (!session) {
    if (publicPath) {
      return svelteKitHandler({ event, resolve, auth, building });
    }

    if (pathname.startsWith('/api/')) return unauthorizedApi();

    const loginURL = new URL('/login', event.url);
    const returnTo = `${pathname}${event.url.search}`;
    if (returnTo !== '/') loginURL.searchParams.set('returnTo', returnTo);
    return Response.redirect(loginURL, 303);
  }

  const tenant = await resolveTenantForAuthUser(
    event.platform.env.DB,
    {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email
    },
    event.cookies.get('nettiva_workspace')
  );

  if (!tenant) {
    if (pathname.startsWith('/api/')) {
      return Response.json(
        { error: 'No active Nettiva workspace membership was found.' },
        { status: 403 }
      );
    }

    return new Response(
      'No active Nettiva workspace membership was found.',
      { status: 403 }
    );
  }

  event.locals.authUserId = session.user.id;
  event.locals.authName = session.user.name;
  event.locals.authEmail = session.user.email;
  event.locals.userId = tenant.userId;
  event.locals.workspaceId = tenant.workspace.id;
  event.locals.workspaceRole = tenant.workspace.role;

  if (event.cookies.get('nettiva_workspace') !== tenant.workspace.id) {
    event.cookies.set('nettiva_workspace', tenant.workspace.id, {
      httpOnly: true,
      sameSite: 'lax',
      secure: event.url.protocol === 'https:',
      path: '/',
      maxAge: 60 * 60 * 24 * 365
    });
  }

  if (pathname === '/login') {
    return Response.redirect(new URL('/', event.url), 303);
  }

  return svelteKitHandler({ event, resolve, auth, building });
};
