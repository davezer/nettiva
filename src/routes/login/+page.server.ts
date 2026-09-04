import type { PageServerLoad } from './$types';
import {
  emailVerificationRequired,
  signupAvailability
} from '$lib/server/auth';
import { authEmailMode } from '$lib/server/email';

function safeReturnTo(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}

function localHost(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

export const load: PageServerLoad = async ({ platform, url }) => {
  const returnTo = safeReturnTo(url.searchParams.get('returnTo'));

  if (!platform) {
    return {
      returnTo,
      canSignUp: false,
      signupMode: 'closed' as const,
      authConfigured: false,
      requiresEmailVerification: false,
      devMailbox: false
    };
  }

  const authConfigured = Boolean(platform.env.BETTER_AUTH_SECRET?.trim());

  if (!authConfigured) {
    return {
      returnTo,
      canSignUp: false,
      signupMode: 'closed' as const,
      authConfigured: false,
      requiresEmailVerification: false,
      devMailbox: false
    };
  }

  const availability = await signupAvailability(platform.env);

  return {
    returnTo,
    canSignUp: availability.canSignUp,
    signupMode: availability.mode,
    authConfigured: true,
    requiresEmailVerification: emailVerificationRequired(platform.env),
    devMailbox:
      localHost(url.hostname) && authEmailMode(platform.env) === 'outbox'
  };
};
