import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { canSignInWithApple, canSignInWithGoogle, signInWithApple, signInWithGoogle } from '@/account';
import type { Provider } from '@/core';
import { useStore } from '@/store';
import { colors } from '@/theme';
import { PixelSprite } from '@/ui/PixelSprite';
import { BodyText, PixelText } from '@/ui/PixelText';

type Props = {
  /** Called once the user has signed in and the core has been told. */
  onSignedIn?: () => void;
};

/**
 * Sign in with Apple and Sign in with Google, one under the other, for wherever a guest is
 * offered a sign-in: Save your progress and Settings. Apple's is Apple's own button, as its
 * guidelines ask; Google's is drawn to match it. Whichever is tapped, the core is told who
 * signed in, and from there both ways behave the same. Says so if this build offers neither.
 */
export function SignInButtons({ onSignedIn }: Props) {
  const { act } = useStore();
  const available = useAvailable();
  const [signingIn, setSigningIn] = useState<Provider | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const signIn = async (provider: Provider) => {
    if (signingIn) return;
    setSigningIn(provider);
    setFailure(null);
    const outcome = await (provider === 'apple' ? signInWithApple() : signInWithGoogle());
    setSigningIn(null);
    if (outcome.status === 'signed-in') {
      act({ type: 'sign-in', ...outcome.account });
      onSignedIn?.();
    } else if (outcome.status === 'failed') {
      setFailure(outcome.reason);
    }
  };

  if (available === null) return null;

  return (
    <View style={styles.buttons}>
      {available.apple ? (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
          cornerRadius={0}
          style={styles.button}
          onPress={() => signIn('apple')}
        />
      ) : null}
      {available.google ? <GoogleButton onPress={() => signIn('google')} /> : null}
      {!available.apple && !available.google ? (
        <BodyText style={styles.hint}>{"Signing in isn't available in this build."}</BodyText>
      ) : null}
      {signingIn ? <BodyText style={styles.hint}>Signing in…</BodyText> : null}
      {failure ? <BodyText style={styles.failure}>{`Couldn't sign in: ${failure}`}</BodyText> : null}
    </View>
  );
}

type Available = { apple: boolean; google: boolean };

/** Which ways of signing in this build and phone offer: null while that is being checked. */
function useAvailable(): Available | null {
  const [available, setAvailable] = useState<Available | null>(null);

  useEffect(() => {
    let gone = false;
    Promise.all([canSignInWithApple(), canSignInWithGoogle()]).then(([apple, google]) => {
      if (!gone) setAvailable({ apple, google });
    });
    return () => {
      gone = true;
    };
  }, []);

  return available;
}

/** Google's "G", 9 pixels square. */
const GOOGLE_G = [
  '..#####..',
  '.#.....#.',
  '#.......#',
  '#........',
  '#...#####',
  '#.......#',
  '#.......#',
  '.#.....#.',
  '..#####..',
];

const GOOGLE_BLUE = '#4285F4';

/** A white button the same size as Apple's, with Google's "G" in its blue. Greys while pressed. */
function GoogleButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Sign in with Google"
      onPress={onPress}
      style={({ pressed }) => [styles.button, styles.google, pressed && styles.googlePressed]}
    >
      <PixelSprite rows={GOOGLE_G} color={GOOGLE_BLUE} scale={2} />
      <PixelText style={styles.googleLabel}>Sign in with Google</PixelText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  buttons: {
    gap: 12,
  },
  button: {
    height: 56,
  },
  google: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: colors.text,
  },
  googlePressed: {
    backgroundColor: '#D9D9D9',
  },
  googleLabel: {
    fontSize: 11,
    lineHeight: 16,
    color: colors.background,
  },
  hint: {
    color: colors.muted,
  },
  failure: {
    color: colors.red,
  },
});
