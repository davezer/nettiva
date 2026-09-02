type EbayEnv = App.Platform['env'];

export const EBAY_SCOPES = [
  'https://api.ebay.com/oauth/api_scope',
  'https://api.ebay.com/oauth/api_scope/sell.inventory.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.finances'
].join(' ');

export function getEbayConfig(env: EbayEnv) {
  const values = {
    clientId: env.EBAY_CLIENT_ID,
    clientSecret: env.EBAY_CLIENT_SECRET,
    redirectUri: env.EBAY_REDIRECT_URI,
    encryptionKey: env.EBAY_TOKEN_ENCRYPTION_KEY
  };
  const missing = Object.entries(values).filter(([, value]) => !value).map(([key]) => key);
  if (missing.length) throw new Error(`Missing eBay configuration: ${missing.join(', ')}`);
  return values as Record<keyof typeof values, string>;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function importKey(base64Key: string) {
  const bytes = base64ToBytes(base64Key);
  if (bytes.byteLength !== 32) throw new Error('EBAY_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptToken(value: string, base64Key: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await importKey(base64Key);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(value));
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(ciphertext))}`;
}

export async function decryptToken(value: string, base64Key: string) {
  const [ivPart, ciphertextPart] = value.split('.');
  if (!ivPart || !ciphertextPart) throw new Error('Stored eBay token is malformed.');
  const key = await importKey(base64Key);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(ivPart) }, key, base64ToBytes(ciphertextPart));
  return new TextDecoder().decode(plaintext);
}

type TokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  scope: string;
  error?: string;
  error_description?: string;
};

async function requestToken(env: EbayEnv, body: URLSearchParams): Promise<TokenResponse> {
  const config = getEbayConfig(env);
  const response = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      authorization: `Basic ${btoa(`${config.clientId}:${config.clientSecret}`)}`,
      'content-type': 'application/x-www-form-urlencoded'
    },
    body
  });
  const result = await response.json() as TokenResponse;
  if (!response.ok) throw new Error(result.error_description || result.error || 'eBay token exchange failed.');
  return result;
}

export function exchangeAuthorizationCode(env: EbayEnv, code: string) {
  const config = getEbayConfig(env);
  return requestToken(env, new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.redirectUri
  }));
}

type AccountRow = {
  id: string;
  accessTokenEncrypted: string;
  refreshTokenEncrypted: string;
  accessTokenExpiresAt: number;
  scopes: string;
};

export async function getAccessToken(env: EbayEnv) {
  const config = getEbayConfig(env);
  const account = await env.DB.prepare(`
    SELECT id, access_token_encrypted AS accessTokenEncrypted,
      refresh_token_encrypted AS refreshTokenEncrypted,
      access_token_expires_at AS accessTokenExpiresAt, scopes
    FROM ebay_accounts LIMIT 1
  `).first<AccountRow>();
  if (!account) throw new Error('No eBay account is connected.');
  if (account.accessTokenExpiresAt > Date.now() + 120_000) {
    return decryptToken(account.accessTokenEncrypted, config.encryptionKey);
  }

  const refreshToken = await decryptToken(account.refreshTokenEncrypted, config.encryptionKey);
  const token = await requestToken(env, new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: account.scopes
  }));
  const encryptedAccessToken = await encryptToken(token.access_token, config.encryptionKey);
  await env.DB.prepare(`
    UPDATE ebay_accounts
    SET access_token_encrypted = ?, access_token_expires_at = ?, updated_at = ?
    WHERE id = ?
  `).bind(encryptedAccessToken, Date.now() + token.expires_in * 1000, new Date().toISOString(), account.id).run();
  return token.access_token;
}
