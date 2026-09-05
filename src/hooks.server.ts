import type { Handle } from '@sveltejs/kit';
import { building } from '$app/environment';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { createAuth, emailVerificationRequired } from '$lib/server/auth';
import { resolveTenantForAuthUser } from '$lib/server/workspace';

const PUBLIC_PATHS = new Set([
  '/login',
  '/forgot-password',
  '/reset-password',
  '/dev/mailbox',
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

function isAccountPath(pathname: string) {
  return pathname === '/account' || pathname.startsWith('/api/account/');
}

function isOnboardingPath(pathname: string) {
  return pathname === '/onboarding' || pathname.startsWith('/api/onboarding');
}

function isOnboardingDependency(pathname: string) {
  return (
    pathname === '/api/ebay/connect' ||
    pathname === '/api/ebay/callback'
  );
}

function unauthorizedApi(message = 'Authentication required.', status = 401) {
  return Response.json(
    { error: message },
    { status, headers: { 'cache-control': 'no-store' } }
  );
}

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.authUserId = null;
  event.locals.authName = null;
  event.locals.authEmail = null;
  event.locals.authEmailVerified = null;
  event.locals.userId = null;
  event.locals.workspaceId = null;
  event.locals.workspaceRole = null;

  if (building) return resolve(event);

  const pathname = event.url.pathname;
  const publicPath = isPublicPath(pathname);

  if (!event.platform) {
    if (publicPath) return resolve(event);

    return new Response(
      'Cloudflare runtime bindings are unavailable. Sellquity auth requires the local D1 runtime.',
      { status: 503 }
    );
  }

  const secret = event.platform.env.BETTER_AUTH_SECRET?.trim();
  if (!secret) {
    if (publicPath) return resolve(event);

    return new Response(
      'Sellquity auth is not configured. Add BETTER_AUTH_SECRET to .dev.vars.',
      { status: 503 }
    );
  }

  const auth = createAuth(
    event.platform.env,
    event.url.origin,
    event.platform.context
  );

  // Better Auth owns its session, verification, reset, and account endpoints.
  if (isAuthPath(pathname)) {
    return svelteKitHandler({ event, resolve, auth, building });
  }

  let session: Awaited<ReturnType<typeof auth.api.getSession>> = null;

  try {
    session = await auth.api.getSession({
      headers: event.request.headers
    });
  } catch (error) {
    console.error('Sellquity session lookup failed', error);
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

  const emailVerified = Boolean(session.user.emailVerified);

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
      return unauthorizedApi('No active Sellquity workspace membership was found.', 403);
    }

    return new Response(
      'No active Sellquity workspace membership was found.',
      { status: 403 }
    );
  }

  event.locals.authUserId = session.user.id;
  event.locals.authName = session.user.name;
  event.locals.authEmail = session.user.email;
  event.locals.authEmailVerified = emailVerified;
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

  const verificationRequired = emailVerificationRequired(event.platform.env);
  if (
    verificationRequired &&
    !emailVerified &&
    !publicPath &&
    !isAccountPath(pathname)
  ) {
    if (pathname.startsWith('/api/')) {
      return unauthorizedApi('Verify your email before using Sellquity business APIs.', 403);
    }

    const accountURL = new URL('/account', event.url);
    accountURL.searchParams.set('verify', 'required');
    return Response.redirect(accountURL, 303);
  }

  const onboardingComplete = tenant.workspace.onboardingStep === 'complete';
  const onboardingAllowed =
    publicPath ||
    isOnboardingPath(pathname) ||
    isOnboardingDependency(pathname) ||
    isAccountPath(pathname);

  if (!onboardingComplete && !onboardingAllowed) {
    if (pathname.startsWith('/api/')) {
      return unauthorizedApi('Finish workspace onboarding before using this API.', 409);
    }
    return Response.redirect(new URL('/onboarding', event.url), 303);
  }

  if (pathname === '/login') {
    return Response.redirect(
      new URL(onboardingComplete ? '/' : '/onboarding', event.url),
      303
    );
  }

  return svelteKitHandler({ event, resolve, auth, building });
};
