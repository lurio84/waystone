import { Cinzel_600SemiBold, Cinzel_700Bold, useFonts } from '@expo-google-fonts/cinzel';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { Colors, Fonts } from '@/constants/theme';
import { initSchema } from '@/db/client';
import { ensureTracking, recoverActiveRun } from '@/tracking/recorder';
// Define la tarea de background en el arranque (side-effect import).
import '@/tracking/locationTask';

SplashScreen.preventAutoHideAsync();

// Waystone es dark-only: tema de navegación fijo, cabeceras talladas en Cinzel.
const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: Colors.dark.background,
    card: Colors.dark.background,
    text: Colors.dark.text,
    border: Colors.dark.backgroundSelected,
    primary: Colors.dark.primary,
  },
};

const screenOptions = {
  headerStyle: { backgroundColor: Colors.dark.background },
  headerTintColor: Colors.dark.text,
  headerTitleStyle: { fontFamily: Fonts.displayBold, letterSpacing: 2, fontSize: 16 },
  contentStyle: { backgroundColor: Colors.dark.background },
} as const;

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Cinzel_600SemiBold, Cinzel_700Bold });

  useEffect(() => {
    initSchema();
    recoverActiveRun().catch(() => {});

    // Al volver a primer plano, solo comprobar que el GPS sigue enganchado.
    // (recoverActiveRun aquí borraría una carrera recién empezada — ver recorder.ts)
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') ensureTracking().catch(() => {});
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={navTheme}>
        <StatusBar style="light" />
        <Stack screenOptions={screenOptions}>
          <Stack.Screen name="index" options={{ title: 'Waystone' }} />
          <Stack.Screen
            name="record"
            options={{ title: 'Carrera', headerBackVisible: false, gestureEnabled: false }}
          />
          <Stack.Screen name="runs" options={{ title: 'Historial' }} />
          <Stack.Screen name="run/[id]" options={{ title: 'Carrera' }} />
          <Stack.Screen name="settings" options={{ title: 'Ajustes' }} />
          <Stack.Screen name="dev-sim" options={{ title: 'Simulador' }} />
        </Stack>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
