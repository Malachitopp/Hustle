/**
 * Signing in: the thin adapter between the phone, Supabase Auth and the core. Both ways in are
 * native. The phone shows Apple's or Google's own sheet, which hands back an identity token,
 * and Supabase Auth checks the token before it issues a session. Apple's token also carries a
 * nonce this file chose, which Supabase checks too. The core keeps its own note of who is
 * signed in (`state.account`); `watchAccount` is how the app keeps that note in step with
 * Supabase's session.
 */
import type { User } from '@supabase/supabase-js';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';

import type { Account, Provider } from '@/core';
import { supabase } from '@/supabase';

/** Who signed in. Whether their record has been restored to this phone is the core's business. */
type WhoSignedIn = Pick<Account, 'userId' | 'provider'>;

export type SignInOutcome =
  | { status: 'signed-in'; account: WhoSignedIn }
  | { status: 'cancelled' }
  | { status: 'failed'; reason: string };

/** What the app calls each way of signing in. */
export function providerName(provider: Provider): string {
  return provider === 'apple' ? 'Apple' : 'Google';
}

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

  return signInToSupabase('apple', credential.identityToken, nonce);
}

/**
 * Google's client ids, from the build's environment: the iOS one made for the app's bundle id,
 * which Google's SDK needs, and the web one, which names the token's audience. A build without
 * the iOS one has no Google sign-in, as a build without a Supabase project has no sign-in at all.
 */
const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

type GoogleSignInModule = typeof import('@react-native-google-signin/google-signin');

/**
 * Google's sign-in module, configured, or null where it cannot work: a build with no Supabase
 * project or no Google client id, or Expo Go, which does not carry the native module. Loaded
 * on first use and kept, so a build without Google sign-in never touches the module at all.
 */
let googleSignIn: Promise<GoogleSignInModule | null> | undefined;

function loadGoogleSignIn(): Promise<GoogleSignInModule | null> {
  googleSignIn ??= (async () => {
    if (!supabase || !googleIosClientId) return null;
    try {
      const module = await import('@react-native-google-signin/google-signin');
      module.GoogleSignin.configure({ iosClientId: googleIosClientId, webClientId: googleWebClientId });
      return module;
    } catch (error) {
      console.warn('Google sign-in is not available in this build.', error);
      return null;
    }
  })();
  return googleSignIn;
}

/**
 * Whether this build can sign in with Google: it has a Supabase project, a Google client id and
 * the native module. Never rejects.
 */
export async function canSignInWithGoogle(): Promise<boolean> {
  return (await loadGoogleSignIn()) !== null;
}

/**
 * Shows Google's sign-in sheet and signs the user into Supabase with the result. Google's
 * token carries no nonce, so Supabase checks only the token itself. Never rejects; the outcome
 * says what happened.
 */
export async function signInWithGoogle(): Promise<SignInOutcome> {
  if (!supabase) return { status: 'failed', reason: 'This build has no Supabase project to sign in to.' };
  const google = await loadGoogleSignIn();
  if (!google) return { status: 'failed', reason: 'This build has no Google sign-in.' };

  let idToken: string;
  try {
    const response = await google.GoogleSignin.signIn();
    if (response.type === 'cancelled') return { status: 'cancelled' };
    if (!response.data.idToken) return { status: 'failed', reason: 'Google did not return an identity token.' };
    idToken = response.data.idToken;
  } catch (error) {
    return { status: 'failed', reason: messageOf(error) };
  }

  return signInToSupabase('google', idToken);
}

/**
 * The way a sign-in under way in this file is being made, so that `watchAccount`, which hears
 * of the new session before the sign-in returns, can name it exactly. Null between sign-ins.
 */
let signingInWith: Provider | null = null;

/** Signs into Supabase with an identity token from `provider`, and the nonce if the token has one. */
async function signInToSupabase(provider: Provider, token: string, nonce?: string): Promise<SignInOutcome> {
  if (!supabase) return { status: 'failed', reason: 'This build has no Supabase project to sign in to.' };
  signingInWith = provider;
  try {
    const { data, error } = await supabase.auth.signInWithIdToken({ provider, token, nonce });
    if (error) return { status: 'failed', reason: error.message };
    if (!data.user) return { status: 'failed', reason: 'Supabase did not return a user.' };
    return { status: 'signed-in', account: { userId: data.user.id, provider } };
  } catch (error) {
    return { status: 'failed', reason: messageOf(error) };
  } finally {
    signingInWith = null;
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
    onChange(session ? { userId: session.user.id, provider: signingInWith ?? providerOf(session.user) } : null);
  });
  return () => data.subscription.unsubscribe();
}

/**
 * How a saved sign-in was made, as far as Supabase says: it names the way the account was first
 * made, which is the way it signed in unless an Apple and a Google sign-in with the same email
 * were joined into one account. The core takes note of it only for an account it does not know
 * yet, so a wrong guess can at most mislabel that rare account, never unsettle a known one.
 */
function providerOf(user: User): Provider {
  return user.app_metadata.provider === 'google' ? 'google' : 'apple';
}

function codeOf(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : undefined;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
