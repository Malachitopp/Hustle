/**
 * Signing in: the thin adapter between the phone, Supabase Auth and the core. Sign in with
 * Apple is native. The phone shows Apple's own sheet, Apple hands back an identity token that
 * carries a nonce this file chose, and Supabase Auth checks the token and the nonce before it
 * issues a session. The core keeps its own note of who is signed in (`state.account`);
 * `watchAccount` is how the app keeps that note in step with Supabase's session.
 */
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';

import type { Account } from '@/core';
import { supabase } from '@/supabase';

/** Who signed in. Whether their record has been restored to this phone is the core's business. */
type WhoSignedIn = Pick<Account, 'userId' | 'provider'>;

export type SignInOutcome =
  | { status: 'signed-in'; account: WhoSignedIn }
  | { status: 'cancelled' }
  | { status: 'failed'; reason: string };

/**
 * Whether this build and phone can sign in with Apple: the build has a Supabase project and
 * the phone offers Sign in with Apple. Never rejects.
 */
export async function canSignInWithApple(): Promise<boolean> {
  if (!supabase) return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * Shows Apple's sign-in sheet and signs the user into Supabase with the result. Only the email
 * is asked for: the display name comes from onboarding, and Apple shares either only on the
 * very first sign-in anyway. Never rejects; the outcome says what happened.
 */
export async function signInWithApple(): Promise<SignInOutcome> {
  if (!supabase) return { status: 'failed', reason: 'This build has no Supabase project to sign in to.' };

  // Apple gets a hash of the nonce and writes it into the token; Supabase gets the nonce itself
  // and checks that it hashes to what the token says. A token from any other sign-in is no use here.
  const nonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);

  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce: hashedNonce,
    });
  } catch (error) {
    if (codeOf(error) === 'ERR_REQUEST_CANCELED') return { status: 'cancelled' };
    return { status: 'failed', reason: messageOf(error) };
  }
  if (!credential.identityToken) return { status: 'failed', reason: 'Apple did not return an identity token.' };

  try {
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
      nonce,
    });
    if (error) return { status: 'failed', reason: error.message };
    if (!data.user) return { status: 'failed', reason: 'Supabase did not return a user.' };
    return { status: 'signed-in', account: { userId: data.user.id, provider: 'apple' } };
  } catch (error) {
    return { status: 'failed', reason: messageOf(error) };
  }
}

/**
 * Calls `onChange` with who Supabase says is signed in: once straight away, and again whenever
 * that changes, whether by a sign-in here or by the server no longer accepting the saved
 * sign-in. Returns a function that stops the calls.
 */
export function watchAccount(onChange: (account: WhoSignedIn | null) => void): () => void {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    // Apple is the only way to sign in for now.
    onChange(session ? { userId: session.user.id, provider: 'apple' } : null);
  });
  return () => data.subscription.unsubscribe();
}

function codeOf(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : undefined;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
