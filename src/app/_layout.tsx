import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { initSchema } from '@/db/client';
import { ensureTracking, recoverActiveRun } from '@/tracking/recorder';
// Define la tarea de background en el arranque (side-effect import).
import '@/tracking/locationTask';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const scheme = useColorScheme();

  useEffect(() => {
    initSchema();
    recoverActiveRun().catch(() => {});
    SplashScreen.hideAsync();

    // Al volver a primer plano, solo comprobar que el GPS sigue enganchado.
    // (recoverActiveRun aquí borraría una carrera recién empezada — ver recorder.ts)
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') ensureTracking().catch(() => {});
    });
    return () => sub.remove();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
        <StatusBar style="auto" />
        <Stack>
          <Stack.Screen name="index" options={{ title: 'Zancada' }} />
          <Stack.Screen
            name="record"
            options={{ title: 'Carrera', headerBackVisible: false, gestureEnabled: false }}
          />
          <Stack.Screen name="runs" options={{ title: 'Historial' }} />
          <Stack.Screen name="run/[id]" options={{ title: 'Carrera' }} />
        </Stack>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
