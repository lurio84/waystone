import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RouteMap } from '@/components/route-map';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { formatDateTime } from '@/core/format';
import { routeSegments } from '@/core/metrics';
import { getEvents, getPoints, getRun } from '@/db/runs';

/** Mapa de la ruta a pantalla completa: sin scroll ni swipe-back que compitan con pan y pinch. */
export default function RunMapScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const runId = Number(id);
  const run = useMemo(() => getRun(runId), [runId]);
  const route = useMemo(
    () =>
      routeSegments(getPoints(runId), getEvents(runId), {
        startedAt: run?.startedAt,
        endedAt: run?.endedAt ?? undefined,
      }),
    [runId, run?.startedAt, run?.endedAt],
  );

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: run ? formatDateTime(run.startedAt) : 'Ruta' }} />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        {route.flat().length >= 2 ? (
          <RouteMap segments={route} style={styles.map} />
        ) : (
          <ThemedText style={styles.empty}>Esta carrera no tiene ruta que mostrar.</ThemedText>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  empty: { padding: 16 },
});
