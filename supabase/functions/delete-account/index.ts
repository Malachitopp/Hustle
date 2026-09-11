/**
 * delete-account: deletes the caller's account for good. In order: Apple is told to revoke the
 * user's Sign in with Apple for Hustle (if a token was kept for them; a Google sign-in has none),
 * every row they own in every table goes (delete_user_rows), and their login is removed from
 * Supabase Auth, which ends every session they had. Nothing is deleted if the revocation fails,
 * so the user can try again.
 *
 * POST with the user's session token as the bearer. Answers 200 {"deleted": true}; 401 for
 * nobody signed in; 503 while there is a token to revoke but no Apple key among the secrets;
 * 502 when Apple will not revoke; 500 when the database or Auth refuse.
 */
import { appleConfig, revokeToken } from '../_shared/apple.ts';
import { caller, json, serviceClient } from '../_shared/http.ts';

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only.' });
  const user = await caller(req);
  if (!user) return json(401, { error: 'Sign in first.' });
  const service = serviceClient();

  const token = await service.from('apple_tokens').select('refresh_token').eq('user_id', user.id).maybeSingle();
  if (token.error) {
    console.error('Could not look up the Apple token.', token.error);
    return json(500, { error: 'Could not look up the Apple token.' });
  }
  if (token.data) {
    const config = appleConfig();
    if (!config) {
      return json(503, { error: 'Sign in with Apple is not set up on the server, so its access cannot be withdrawn yet.' });
    }
    try {
      await revokeToken(config, token.data.refresh_token);
    } catch (error) {
      console.error('Apple would not revoke the token.', error);
      return json(502, { error: 'Apple could not withdraw its sign-in. Try again in a moment.' });
    }
  }

  const rows = await service.rpc('delete_user_rows', { p_user_id: user.id });
  if (rows.error) {
    console.error("Could not delete the user's rows.", rows.error);
    return json(500, { error: 'Could not delete your data.' });
  }

  const login = await service.auth.admin.deleteUser(user.id);
  if (login.error) {
    console.error('Could not delete the user.', login.error);
    return json(500, { error: 'Could not remove your login.' });
  }
  return json(200, { deleted: true });
});
