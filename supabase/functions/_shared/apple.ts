/**
 * Apple's token endpoints, for the two Edge Functions. Sign in with Apple hands the app a
 * one-time authorization code; exchanging it here gives a refresh token, which is what Apple's
 * revoke endpoint takes when the account is deleted. Each call proves it comes from Hustle with
 * a client secret: a short-lived JWT signed with the app's Sign in with Apple key, which lives
 * in the function's secrets and nowhere else.
 */

/** The Apple settings, from the function's secrets. */
export type AppleConfig = {
  /** The Apple Developer team id. */
  teamId: string;
  /** The id of the Sign in with Apple key. */
  keyId: string;
  /** The key itself: the .p8 file's contents (PKCS#8, PEM). */
  privateKey: string;
  /** The app's bundle id, which is the client id for a native sign-in. */
  clientId: string;
};

const TOKEN_URL = 'https://appleid.apple.com/auth/token';
const REVOKE_URL = 'https://appleid.apple.com/auth/revoke';
const BUNDLE_ID = 'com.malachitopp.hustle';

/** The settings from the secrets, or null while the team id, key id or key is missing. */
export function appleConfig(): AppleConfig | null {
  const teamId = Deno.env.get('APPLE_TEAM_ID');
  const keyId = Deno.env.get('APPLE_KEY_ID');
  const privateKey = Deno.env.get('APPLE_PRIVATE_KEY');
  if (!teamId || !keyId || !privateKey) return null;
  return { teamId, keyId, privateKey, clientId: Deno.env.get('APPLE_CLIENT_ID') || BUNDLE_ID };
}

/** What Apple answered when it would not do as asked. */
export class AppleError extends Error {
  constructor(
    message: string,
    /** The HTTP status Apple answered with. */
    readonly status: number,
    /** Apple's error code, "invalid_grant" say, when it gave one. */
    readonly code: string | null,
  ) {
    super(message);
    this.name = 'AppleError';
  }
}

type AppleAnswer = { refresh_token?: unknown; error?: unknown; error_description?: unknown };

/**
 * Exchanges a sign-in's one-time authorization code for a refresh token. Rejects with an
 * AppleError if Apple will not: a code used already, or older than five minutes, gets
 * "invalid_grant".
 */
export async function exchangeCode(config: AppleConfig, code: string): Promise<string> {
  const answer = await call(TOKEN_URL, config, { code, grant_type: 'authorization_code' });
  const body = await bodyOf(answer);
  if (!answer.ok) throw errorFrom(answer.status, body);
  if (typeof body.refresh_token !== 'string' || body.refresh_token === '') {
    throw new AppleError('Apple returned no refresh token.', answer.status, null);
  }
  return body.refresh_token;
}

/**
 * Revokes a refresh token, and with it the user's Sign in with Apple for Hustle. A token Apple
 * no longer knows counts as revoked. Rejects with an AppleError otherwise.
 */
export async function revokeToken(config: AppleConfig, refreshToken: string): Promise<void> {
  const answer = await call(REVOKE_URL, config, { token: refreshToken, token_type_hint: 'refresh_token' });
  if (answer.ok) return;
  const error = errorFrom(answer.status, await bodyOf(answer));
  if (error.code === 'invalid_grant') return;
  throw error;
}

async function bodyOf(answer: Response): Promise<AppleAnswer> {
  try {
    const body: unknown = await answer.json();
    return body && typeof body === 'object' ? (body as AppleAnswer) : {};
  } catch {
    return {};
  }
}

function errorFrom(status: number, body: AppleAnswer): AppleError {
  const code = typeof body.error === 'string' ? body.error : null;
  const description = typeof body.error_description === 'string' ? body.error_description : null;
  const detail = `${code ? ` ${code}` : ''}${description ? `: ${description}` : ''}`;
  return new AppleError(`Apple answered ${status}${detail}.`, status, code);
}

/** One form-encoded POST to Apple, with the client id and a fresh client secret. */
async function call(url: string, config: AppleConfig, fields: Record<string, string>): Promise<Response> {
  const body = new URLSearchParams({ ...fields, client_id: config.clientId, client_secret: await clientSecret(config) });
  return fetch(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
}

/**
 * The client secret Apple asks for: a JWT signed with the Sign in with Apple key (ES256), naming
 * the team, the key and the app, and good for five minutes (Apple allows up to six months).
 */
async function clientSecret(config: AppleConfig): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'ES256', kid: config.keyId, typ: 'JWT' };
  const claims = { iss: config.teamId, iat: now, exp: now + 5 * 60, aud: 'https://appleid.apple.com', sub: config.clientId };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pkcs8(config.privateKey),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  // WebCrypto's ECDSA signature is the raw r||s pair, which is exactly what a JWS wants.
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${base64url(new Uint8Array(signature))}`;
}

/** The key's DER bytes from its PEM text, however the secret was pasted: real newlines, "\n", or none. */
function pkcs8(pem: string): Uint8Array<ArrayBuffer> {
  const base64 = pem.replace(/\\n/g, '\n').replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
  const binary = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64url(input: string | Uint8Array): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
