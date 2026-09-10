import { PressStart2P_400Regular } from '@expo-google-fonts/press-start-2p';
import { VT323_400Regular } from '@expo-google-fonts/vt323';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';

import { initialState, type State } from '@/core';
import { defaultSettings, type Settings } from '@/settings';
import { loadSettings, loadState } from '@/storage';
import { StoreProvider } from '@/store';
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
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Screen name="(tabs)" />
      </Stack>
    </StoreProvider>
  );
}
