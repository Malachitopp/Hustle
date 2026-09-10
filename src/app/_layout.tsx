import { PressStart2P_400Regular } from '@expo-google-fonts/press-start-2p';
import { VT323_400Regular } from '@expo-google-fonts/vt323';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';

import { initialState, type State } from '@/core';
import { loadState } from '@/storage';
import { StoreProvider } from '@/store';
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
    <StoreProvider initial={history}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Screen name="(tabs)" />
      </Stack>
    </StoreProvider>
  );
}
