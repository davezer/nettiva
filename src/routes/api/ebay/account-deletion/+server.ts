import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

type EbayDeletionEnv = {
  EBAY_ACCOUNT_DELETION_VERIFICATION_TOKEN?: string;
};

type EbayDeletionPayload = {
  metadata?: {
    topic?: string;
    schemaVersion?: string;
    deprecated?: boolean;
  };
  notification?: {
    notificationId?: string;
    eventDate?: string;
    publishDate?: string;
    publishAttemptCount?: number;
    data?: {
      username?: string;
      userId?: string;
      eiasToken?: string;
    };
  };
};

function getVerificationToken(platform: App.Platform | undefined) {
  if (!platform) return null;

  return (
    platform.env as App.Platform['env'] & EbayDeletionEnv
  ).EBAY_ACCOUNT_DELETION_VERIFICATION_TOKEN?.trim() ?? null;
}

function validVerificationToken(token: string) {
  return /^[A-Za-z0-9_-]{32,80}$/.test(token);
}

function endpointForChallenge(url: URL) {
  // eBay hashes the exact endpoint string entered in the Developer Portal.
  // The request arrives on that same host/path, so derive it from the request
  // itself and deliberately omit ?challenge_code=...
  return `${url.origin}${url.pathname}`;
}

function bytesToHex(bytes: Uint8Array) {
  return [...bytes]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * eBay endpoint ownership verification.
 *
 * eBay calls:
 *   GET /api/ebay/account-deletion?challenge_code=...
 *
 * The required response is SHA-256:
 *   challengeCode + verificationToken + endpointURL
 */
export const GET: RequestHandler = async ({ platform, url }) => {
  const challengeCode = url.searchParams.get('challenge_code')?.trim();
  const verificationToken = getVerificationToken(platform);

  if (!challengeCode) {
    return json(
      { error: 'challenge_code is required.' },
      {
        status: 400,
        headers: { 'cache-control': 'no-store' }
      }
    );
  }

  if (
    !verificationToken ||
    !validVerificationToken(verificationToken)
  ) {
    console.error(
      'eBay deletion webhook verification token is missing or invalid.'
    );

    return json(
      { error: 'Webhook verification is not configured.' },
      {
        status: 503,
        headers: { 'cache-control': 'no-store' }
      }
    );
  }

  const endpoint = endpointForChallenge(url);
  const input =
    challengeCode +
    verificationToken +
    endpoint;

  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(input)
  );

  return json(
    {
      challengeResponse: bytesToHex(
        new Uint8Array(digest)
      )
    },
    {
      status: 200,
      headers: { 'cache-control': 'no-store' }
    }
  );
};

/**
 * Marketplace Account Deletion notification receiver.
 *
 * Current Sellquity schema intentionally does not persist eBay buyer username,
 * immutable buyer userId, EIAS token, shipping address, phone, or buyer email.
 * Therefore there is no buyer-personal-data row to remove in the current
 * application model.
 *
 * We still receive and acknowledge the required deletion event. Before
 * Sellquity ever persists buyer identity/address data through automated order
 * sync, this handler must be upgraded to cryptographically verify the
 * X-EBAY-SIGNATURE and delete/anonymize those persisted buyer fields.
 */
export const POST: RequestHandler = async ({ request }) => {
  const signature = request.headers.get('x-ebay-signature');

  // eBay's current notification format includes this header. We require its
  // presence even though Step 1 does not yet perform destructive processing.
  if (!signature) {
    return new Response(null, { status: 412 });
  }

  let payload: EbayDeletionPayload;

  try {
    payload = await request.json() as EbayDeletionPayload;
  } catch {
    return json(
      { error: 'Invalid JSON payload.' },
      { status: 400 }
    );
  }

  if (
    payload.metadata?.topic !==
    'MARKETPLACE_ACCOUNT_DELETION'
  ) {
    return json(
      { error: 'Unsupported notification topic.' },
      { status: 400 }
    );
  }

  const notificationId =
    payload.notification?.notificationId;

  if (!notificationId) {
    return json(
      { error: 'notificationId is required.' },
      { status: 400 }
    );
  }

  // Deliberately log only the notification ID. Do not log buyer identifiers
  // from a privacy-deletion request.
  console.info(
    `Acknowledged eBay marketplace account deletion notification ${notificationId}.`
  );

  // eBay accepts 200/201/202/204 acknowledgements.
  return new Response(null, {
    status: 204,
    headers: { 'cache-control': 'no-store' }
  });
};
