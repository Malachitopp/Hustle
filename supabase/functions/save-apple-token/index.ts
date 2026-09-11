/**
 * save-apple-token: called by the app right after a Sign in with Apple, with Apple's one-time
 * authorization code. Exchanges the code with Apple for a refresh token and keeps it in
 * apple_tokens, which only the server's role can reach, so that delete-account can one day
 * revoke the user's Sign in with Apple for Hustle, as Apple asks of apps that delete accounts.
 *
 * POST, JSON body {"authorizationCode": "..."}, with the user's session token as the bearer.
 * Answers 200 {"saved": true}; 401 for nobody signed in; 400 for a missing code or one Apple
 * refuses; 503 while the Apple key is not among the secrets; 502 when Apple cannot be reached.
 */
import { appleConfig, AppleError, exchangeCode } from '../_shared/apple.ts';
import { caller, json, serviceClient } from '../_shared/http.ts';

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only.' });
  const user = await caller(req);
  if (!user) return json(401, { error: 'Sign in first.' });

  const body: unknown = await req.json().catch(() => null);
  const code = body && typeof body === 'object' ? (body as { authorizationCode?: unknown }).authorizationCode : undefined;
  if (typeof code !== 'string' || code === '') return json(400, { error: "Send Apple's authorization code." });

  const config = appleConfig();
  if (!config) return json(503, { error: 'Sign in with Apple is not set up on the server.' });

  let refreshToken: string;
  try {
    refreshToken = await exchangeCode(config, code);
  } catch (error) {
    console.error('Apple would not exchange the code.', error);
    const refused = error instanceof AppleError && error.status === 400;
    return json(refused ? 400 : 502, { error: refused ? 'Apple did not accept the code.' : 'Apple could not be reached.' });
  }

  const { error } = await serviceClient()
    .from('apple_tokens')
    .upsert({ user_id: user.id, refresh_token: refreshToken, updated_at: new Date().toISOString() });
  if (error) {
    console.error('Could not keep the Apple token.', error);
    return json(500, { error: 'Could not keep the token.' });
  }
  return json(200, { saved: true });
});
