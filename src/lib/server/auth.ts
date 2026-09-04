import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { queueAuthEmail } from './email';

type NettivaEnv = App.Platform['env'];
export type SignupMode = 'closed' | 'founder' | 'open';

export function signupMode(env: NettivaEnv): SignupMode {
  const value = env.NETTIVA_SIGNUP_MODE?.trim().toLowerCase();
  return value === 'founder' || value === 'open' ? value : 'closed';
}

export function emailVerificationRequired(env: NettivaEnv) {
  return ['1', 'true', 'yes', 'on'].includes(
    env.NETTIVA_REQUIRE_EMAIL_VERIFICATION?.trim().toLowerCase() ?? ''
  );
}

export async function signupAvailability(env: NettivaEnv) {
  const mode = signupMode(env);
  const row = await env.DB.prepare(
    'SELECT COUNT(*) AS count FROM "user"'
  ).first<{ count: number }>();
  const userCount = Number(row?.count ?? 0);

  return {
    mode,
    canSignUp: mode === 'open' || (mode === 'founder' && userCount === 0),
    userCount
  };
}

export function createAuth(
  env: NettivaEnv,
  requestOrigin?: string,
  context?: ExecutionContext
) {
  const secret = env.BETTER_AUTH_SECRET?.trim();
  if (!secret) {
    throw new Error(
      'BETTER_AUTH_SECRET is not configured. Add it to .dev.vars for local auth.'
    );
  }

  const configuredURL = env.BETTER_AUTH_URL?.trim();
  const baseURL = configuredURL || requestOrigin;
  const requireVerification = emailVerificationRequired(env);

  return betterAuth({
    database: env.DB,
    secret,
    ...(baseURL ? { baseURL } : {}),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      autoSignIn: !requireVerification,
      requireEmailVerification: requireVerification,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        queueAuthEmail(env, context, {
          authUserId: user.id,
          to: user.email,
          kind: 'reset-password',
          subject: 'Reset your Nettiva password',
          intro: 'Use this secure link to choose a new Nettiva password. If you did not request a reset, you can ignore this email.',
          buttonLabel: 'Reset password',
          actionUrl: url
        });
      }
    },
    emailVerification: {
      sendVerificationEmail: async ({ user, url }) => {
        queueAuthEmail(env, context, {
          authUserId: user.id,
          to: user.email,
          kind: 'verify-email',
          subject: 'Verify your Nettiva email',
          intro: 'Confirm this email address so Nettiva can use it for account recovery and security notifications.',
          buttonLabel: 'Verify email',
          actionUrl: url
        });
      },
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true
    },
    user: {
      changeEmail: {
        enabled: true,
        updateEmailWithoutVerification: false,
        sendChangeEmailConfirmation: async ({ user, newEmail, url }) => {
          queueAuthEmail(env, context, {
            authUserId: user.id,
            to: user.email,
            kind: 'change-email-current',
            subject: 'Approve your Nettiva email change',
            intro: `A request was made to change your Nettiva login email to ${newEmail}. Confirm this request to continue.`,
            buttonLabel: 'Approve email change',
            actionUrl: url
          });
        }
      }
    },
    session: {
      expiresIn: 60 * 60 * 24 * 14,
      updateAge: 60 * 60 * 24
    },
    advanced: {
      ipAddress: {
        ipAddressHeaders: ['cf-connecting-ip']
      }
    },
    rateLimit: {
      enabled: true,
      storage: 'database',
      modelName: 'rateLimit',
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/email': { window: 60, max: 10 },
        '/sign-up/email': { window: 3600, max: 5 },
        '/request-password-reset': { window: 3600, max: 5 },
        '/send-verification-email': { window: 3600, max: 8 },
        '/change-email': { window: 3600, max: 5 }
      }
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const availability = await signupAvailability(env);
            if (!availability.canSignUp) {
              throw new APIError('BAD_REQUEST', {
                message: 'New Nettiva account creation is currently closed.'
              });
            }

            const founderEmail = env.NETTIVA_FOUNDER_EMAIL?.trim().toLowerCase();
            if (
              availability.mode === 'founder' &&
              founderEmail &&
              user.email.toLowerCase() !== founderEmail
            ) {
              throw new APIError('BAD_REQUEST', {
                message: 'This email is not authorized for founder setup.'
              });
            }

            return { data: user };
          }
        }
      }
    }
  });
}
