import { PressStart2P_400Regular } from '@expo-google-fonts/press-start-2p';
import { VT323_400Regular } from '@expo-google-fonts/vt323';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';

import { initialState, type State } from '@/core';
import { useAccountSync } from '@/hooks/useAccountSync';
import { useNotificationSync } from '@/hooks/useNotificationSync';
import { useRestoreSync } from '@/hooks/useRestoreSync';
import { useUploadSync } from '@/hooks/useUploadSync';
import { loadState } from '@/storage';
import { StoreProvider, useStore } from '@/store';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ PressStart2P_400Regular, VT323_400Regular });
  const [history, setHistory] = useState<State | null>(null);

  useEffect(() => {
    loadState()
      .catch((error: unknown) => {
        console.error('Could not load the saved history.', error);
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
