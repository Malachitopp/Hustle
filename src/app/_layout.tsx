import { PressStart2P_400Regular } from '@expo-google-fonts/press-start-2p';
import { VT323_400Regular } from '@expo-google-fonts/vt323';
import { useFonts } from 'expo-font';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';

import { initialState, type State } from '@/core';
import { reportCrash, reportError, startCrashReports } from '@/crashReports';
import { useAccountSync } from '@/hooks/useAccountSync';
import { useNotificationSync } from '@/hooks/useNotificationSync';
import { useRestoreSync } from '@/hooks/useRestoreSync';
import { useUploadSync } from '@/hooks/useUploadSync';
import { loadState } from '@/storage';
import { StoreProvider, useStore } from '@/store';
import { colors } from '@/theme';
import { PixelButton } from '@/ui/PixelButton';
import { BodyText, PixelText } from '@/ui/PixelText';
import { Screen } from '@/ui/Screen';

startCrashReports();
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ PressStart2P_400Regular, VT323_400Regular });
  const [history, setHistory] = useState<State | null>(null);

  useEffect(() => {
    loadState()
      .catch((error: unknown) => {
        reportError('Could not load the saved history.', error);
        return initialState;
      })
      .then(setHistory);
  }, []);

  const ready = (fontsLoaded || fontError !== null) && history !== null;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready || history === null) return null;

  return (
    <StoreProvider history={history}>
      <StatusBar style="light" />
      <NotificationSync />
      <AccountSync />
      <UploadSync />
      <RestoreSync />
      <Routes />
    </StoreProvider>
  );
}

/** Keeps the phone's pending notifications matching the core's schedule, whichever tab is open. */
function NotificationSync() {
  const { state } = useStore();
  useNotificationSync(state);
  return null;
}

/** Keeps the core's note of who is signed in matching Supabase's session. */
function AccountSync() {
  useAccountSync();
  return null;
}

/** Uploads the sessions, goals and settings the core says are waiting, at the moments the spec names. */
function UploadSync() {
  useUploadSync();
  return null;
}

/** Downloads what the account holds after a sign-in, so a new phone picks up where it left off. */
function RestoreSync() {
  useRestoreSync();
  return null;
}

/**
 * Onboarding until a display name has been chosen, then the tabs. Only one of the two is ever
 * reachable, so choosing the name is what moves the app on to Home.
 */
function Routes() {
  const { state } = useStore();
  const onboarded = state.displayName !== null;
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Protected guard={!onboarded}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={onboarded}>
        <Stack.Screen name="(tabs)" />
      </Stack.Protected>
    </Stack>
  );
}

/**
 * What shows instead of the app when a screen throws while drawing, which would otherwise close
 * the app. React Native does not pass such a crash to Sentry itself, so it is reported here. Try
 * again starts the app afresh from the saved history, which a crash never touches.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    reportCrash(error);
  }, [error]);

  return (
    <Screen style={styles.crashed}>
      <PixelText style={styles.crashedTitle}>Something went wrong</PixelText>
      <BodyText style={styles.crashedText}>
        {"Hustle ran into a problem it couldn't get past. Your record is safe. If trying again doesn't help, close Hustle and open it again."}
      </BodyText>
      <PixelButton label="Try again" variant="primary" onPress={retry} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  crashed: {
    justifyContent: 'center',
    gap: 24,
  },
  crashedTitle: {
    fontSize: 16,
    lineHeight: 24,
  },
  crashedText: {
    color: colors.muted,
  },
});
