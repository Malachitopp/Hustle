import { PressStart2P_400Regular } from '@expo-google-fonts/press-start-2p';
import { VT323_400Regular } from '@expo-google-fonts/vt323';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';

import { initialState, type State } from '@/core';
import { useNotificationSync } from '@/hooks/useNotificationSync';
import { defaultSettings, type Settings } from '@/settings';
import { loadSettings, loadState } from '@/storage';
import { StoreProvider, useStore } from '@/store';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync();

type Saved = { history: State; settings: Settings };

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ PressStart2P_400Regular, VT323_400Regular });
  const [saved, setSaved] = useState<Saved | null>(null);

  useEffect(() => {
    Promise.all([
      loadState().catch((error: unknown) => {
        console.error('Could not load the saved history.', error);
        return initialState;
      }),
      loadSettings().catch((error: unknown) => {
        console.error('Could not load the saved settings.', error);
        return defaultSettings;
      }),
    ]).then(([history, settings]) => setSaved({ history, settings }));
  }, []);

  const ready = (fontsLoaded || fontError !== null) && saved !== null;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready || saved === null) return null;

  return (
    <StoreProvider history={saved.history} settings={saved.settings}>
      <StatusBar style="light" />
      <NotificationSync />
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
