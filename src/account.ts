/**
 * Signing in and out: the thin adapter between the phone, Supabase Auth and the core. Both ways
 * in are native. The phone shows Apple's or Google's own sheet, which hands back an identity
 * token, and Supabase Auth checks the token before it issues a session. Apple's token also
 * carries a nonce this file chose, which Supabase checks too. The core keeps its own note of who
 * is signed in (`state.account`); `watchAccount` is how the app keeps that note in step with
 * Supabase's session. Signing out and deleting the account go through here as well; clearing
 * the phone's copy afterwards is the core's business.
 */
import { FunctionsHttpError, type User } from '@supabase/supabase-js';
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

  const outcome = await signInToSupabase('apple', credential.identityToken, nonce);
  // Apple's one-time code goes to the server, which keeps what it needs to revoke this sign-in
  // if the account is ever deleted. The sign-in stands whether or not that works.
  if (outcome.status === 'signed-in' && credential.authorizationCode) {
    void saveAppleToken(credential.authorizationCode);
  }
  return outcome;
}

/**
 * Hands Apple's one-time authorization code to the server, which exchanges it with Apple for a
 * refresh token and keeps that where no phone can read it, so that deleting the account can
 * revoke the user's Sign in with Apple for Hustle, as Apple asks. Best effort: the code is good
 * for five minutes and one use, so a failure is only logged, and the next Apple sign-in brings a
 * new code. Never rejects.
 */
async function saveAppleToken(authorizationCode: string): Promise<void> {
  if (!supabase) return;
  try {
    const { error } = await supabase.functions.invoke('save-apple-token', { body: { authorizationCode } });
    if (error) console.warn(`Could not keep the Apple token: ${await reasonOf(error)}`);
  } catch (error) {
    console.warn('Could not keep the Apple token.', error);
  }
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
    } catch {
      // Expected in Expo Go and in a build made without the Google client id: the screens just
      // offer no Google sign-in, so this is worth a line in the log and nothing more.
      console.log('Google sign-in is not available in this build: it has no native Google sign-in module.');
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

export type SignOutOutcome = { status: 'signed-out' } | { status: 'failed'; reason: string };

/**
 * Ends this phone's sign-in: the server is told to forget this phone's session (any other phone
 * stays signed in) and, for a Google sign-in, Google's SDK forgets the account, so the next
 * sign-in asks which one to use. Needs the connection, because a sign-out the server never
 * hears of would leave the session live; never rejects. Clearing the phone's copy is the core's
 * business (`sign-out`).
 */
export async function signOut(provider: Provider): Promise<SignOutOutcome> {
  if (!supabase) return { status: 'signed-out' };
  try {
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) return { status: 'failed', reason: error.message };
  } catch (error) {
    return { status: 'failed', reason: messageOf(error) };
  }
  if (provider === 'google') await forgetGoogleAccount();
  return { status: 'signed-out' };
}

export type DeleteAccountOutcome = { status: 'deleted' } | { status: 'failed'; reason: string };

/**
 * Deletes the account for good, through the server: Apple is told to revoke the user's Sign in
 * with Apple for Hustle, every row they own goes and so does their login. This phone then
 * forgets the session (the server refuses it now, which the sign-out takes as done) and, for a
 * Google sign-in, Google's SDK withdraws Hustle's access to the Google account. Needs the
 * connection; never rejects. Clearing the phone's copy is the core's business (`sign-out`).
 */
export async function deleteAccount(provider: Provider): Promise<DeleteAccountOutcome> {
  if (!supabase) return { status: 'failed', reason: 'This build has no Supabase project.' };
  try {
    const { error } = await supabase.functions.invoke('delete-account');
    if (error) return { status: 'failed', reason: await reasonOf(error) };
  } catch (error) {
    return { status: 'failed', reason: messageOf(error) };
  }
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) console.warn('The account is deleted, but the phone could not forget its session.', error);
  if (provider === 'google') await withdrawGoogleAccess();
  return { status: 'deleted' };
}

/** Google's SDK forgets the account, so the next sign-in asks which one to use. Best effort. */
async function forgetGoogleAccount(): Promise<void> {
  const google = await loadGoogleSignIn();
  if (!google) return;
  try {
    await google.GoogleSignin.signOut();
  } catch (error) {
    console.warn('Google could not forget the account.', error);
  }
}

/** Hustle's access to the Google account is withdrawn, and the SDK forgets it. Best effort. */
async function withdrawGoogleAccess(): Promise<void> {
  const google = await loadGoogleSignIn();
  if (!google) return;
  try {
    await google.GoogleSignin.revokeAccess();
    await google.GoogleSignin.signOut();
  } catch (error) {
    console.warn("Google could not withdraw Hustle's access.", error);
  }
}

/** What went wrong with a call to one of the server's functions, in words the user can be shown. */
async function reasonOf(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = (await error.context.json()) as { error?: unknown };
      if (typeof body.error === 'string' && body.error !== '') return body.error;
    } catch {
      // The answer was not JSON.
    }
    return `The server answered ${error.context.status}.`;
  }
  return messageOf(error);
}

/**
 * Calls `onChange` with who Supabase says is signed in: once straight away, and again whenever
 * that changes, whether by a sign-in here, a sign-out here, or the server no longer accepting
 * the saved sign-in. Returns a function that stops the calls.
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
