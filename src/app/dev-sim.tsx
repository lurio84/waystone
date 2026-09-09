import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { formatKm } from '@/core/format';
import { getActiveRun } from '@/db/runs';
import { useTheme } from '@/hooks/use-theme';
import { ROUTES, routeLengthMeters } from '@/dev/routes';
import { startSimulation } from '@/dev/simulator';
import { useSession } from '@/store/session';

/**
 * Pantalla de desarrollo / modo demo. Lanza el simulador de carrera sobre
 * rutas sintéticas. Enlazada desde la home solo en `__DEV__`.
 */
export default function DevSimScreen() {
  const theme = useTheme();
  const router = useRouter();
  const beginSession = useSession((s) => s.begin);
  const [busy, setBusy] = useState(false);

  const run = (routeId: string, accelerated: boolean) => {
    if (getActiveRun()) {
      Alert.alert('Carrera en curso', 'Termina la carrera activa antes de simular otra.');
      return;
    }
    const route = ROUTES.find((r) => r.id === routeId)!;
    setBusy(true);

    if (accelerated) {
      const handle = startSimulation(route, {
        accelerated: true,
        onDone: (runId) => {
          setBusy(false);
          router.replace(`/run/${runId}`);
        },
      });
      if (!handle) setBusy(false);
      return;
    }

    const handle = startSimulation(route, { accelerated: false });
    setBusy(false);
    if (handle) {
      beginSession(handle.runId, handle.startedAt);
      router.push('/record');
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <ThemedText type="small" themeColor="textSecondary">
            El simulador inyecta puntos GPS sintéticos por el mismo camino que la
            grabación real. Sirve para probar métricas, autopausa, parciales y mapa
            sin salir a correr.
          </ThemedText>

          {ROUTES.map((r) => (
            <View
              key={r.id}
              style={[styles.card, { backgroundColor: theme.backgroundElement }]}
            >
              <ThemedText type="subtitle">{r.name}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {formatKm(routeLengthMeters(r))} km · {r.description}
              </ThemedText>
              <View style={styles.row}>
                <Pressable
                  disabled={busy}
                  onPress={() => run(r.id, false)}
                  style={[styles.btn, { backgroundColor: theme.primary }]}
                >
                  <ThemedText type="smallBold" themeColor="background">
                    Tiempo real
                  </ThemedText>
                </Pressable>
                <Pressable
                  disabled={busy}
                  onPress={() => run(r.id, true)}
                  style={[styles.btn, { backgroundColor: theme.backgroundSelected }]}
                >
                  <ThemedText type="smallBold">Rápido ×30</ThemedText>
                </Pressable>
              </View>
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  scroll: { padding: Spacing.three, gap: Spacing.three },
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
  row: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.one },
  btn: { flex: 1, borderRadius: Spacing.two, paddingVertical: Spacing.three, alignItems: 'center' },
});
