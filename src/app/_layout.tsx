import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { initSchema } from '@/db/client';
import { recoverActiveRun } from '@/tracking/recorder';
// Define la tarea de background en el arranque (side-effect import).
import '@/tracking/locationTask';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const scheme = useColorScheme();

  useEffect(() => {
    initSchema();
    recoverActiveRun().catch(() => {});
    SplashScreen.hideAsync();
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
