import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StonePanel } from '@/components/stone-panel';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { formatDateTime, formatDuration, formatKm, formatPace } from '@/core/format';
import { getActiveRun, listRuns } from '@/db/runs';
import type { RunRow } from '@/db/schema';
import { useTheme } from '@/hooks/use-theme';
import {
  requestBatteryExemptionOnce,
  requestPermissions,
  startRecording,
} from '@/tracking/recorder';
import { useSession } from '@/store/session';

export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const beginSession = useSession((s) => s.begin);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [hasActive, setHasActive] = useState(false);
  const [starting, setStarting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setRuns(listRuns(5));
      const active = getActiveRun();
      setHasActive(!!active);
      if (active && useSession.getState().runId == null) {
        beginSession(active.id, active.startedAt);
      }
    }, [beginSession]),
  );

  const onStart = async () => {
    setStarting(true);
    try {
      const perm = await requestPermissions();
      if (perm === 'denied') {
        Alert.alert(
          'Permiso de ubicación',
          'Zancada necesita acceso a la ubicación para grabar la carrera.',
        );
        return;
      }
      if (perm === 'foreground-only') {
        Alert.alert(
          'Ubicación en segundo plano',
          'Sin el permiso "Permitir siempre" la grabación puede cortarse al apagar la pantalla. Puedes cambiarlo en Ajustes.',
        );
      }
      await requestBatteryExemptionOnce();
      const runId = await startRecording();
      const active = getActiveRun();
      beginSession(runId, active?.startedAt ?? Date.now());
      router.push('/record');
    } finally {
      setStarting(false);
    }
  };

  const onResume = async () => {
    setStarting(true);
    try {
      // Reengancha el GPS: si Android mató el servicio (doze, OEM), esto lo
      // relanza desde un contexto en primer plano, donde SÍ se puede arrancar
      // un foreground service. startRecording no crea otra carrera si ya hay una activa.
      await startRecording();
      router.push('/record');
    } finally {
      setStarting(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Pressable
            onPress={hasActive ? onResume : onStart}
            disabled={starting}
            style={[
              styles.cta,
              { backgroundColor: hasActive ? theme.warn : theme.primary, opacity: starting ? 0.6 : 1 },
            ]}
          >
            <ThemedText type="inscription" style={styles.ctaText} themeColor="background">
              {hasActive ? 'Reanudar carrera' : starting ? 'Preparando…' : 'Empezar carrera'}
            </ThemedText>
          </Pressable>

          <View style={styles.listHeader}>
            <ThemedText
              type="inscription"
              themeColor="textSecondary"
              numberOfLines={1}
              style={styles.sectionLabel}
            >
              Historial
            </ThemedText>
            <View style={styles.headerLinks}>
              {runs.length > 0 && (
                <ThemedText type="link" themeColor="primary" onPress={() => router.push('/runs')}>
                  Ver todo
                </ThemedText>
              )}
              <ThemedText
                type="link"
                themeColor="textSecondary"
                onPress={() => router.push('/settings')}
              >
                Ajustes
              </ThemedText>
            </View>
          </View>

          {runs.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              Aún no has grabado ninguna carrera.
            </ThemedText>
          ) : (
            runs.map((r) => (
              <Pressable key={r.id} onPress={() => router.push(`/run/${r.id}`)}>
                <StonePanel style={styles.row}>
                  <ThemedText type="inscription" themeColor="textSecondary">
                    {formatDateTime(r.startedAt)}
                  </ThemedText>
                  <View style={styles.rowStats}>
                    <ThemedText type="subtitle">{formatKm(r.distanceM)} km</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {formatDuration(r.movingTimeS)} · {formatPace(r.avgPaceSPerKm)} /km
                    </ThemedText>
                  </View>
                </StonePanel>
              </Pressable>
            ))
          )}

          {__DEV__ && (
            <ThemedText
              type="link"
              themeColor="textSecondary"
              onPress={() => router.push('/dev-sim')}
              style={styles.devLink}
            >
              · simulador
            </ThemedText>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  scroll: { padding: Spacing.three, gap: Spacing.three },
  cta: {
    paddingVertical: Spacing.five,
    alignItems: 'center',
  },
  ctaText: { fontSize: 17, letterSpacing: 3 },
  sectionLabel: { fontSize: 13, letterSpacing: 2, flexShrink: 0 },
  devLink: { textAlign: 'center', marginTop: Spacing.four },
  headerLinks: { flexDirection: 'row', gap: Spacing.three, alignItems: 'center' },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  row: {
    gap: Spacing.one,
  },
  rowStats: { gap: Spacing.half },
});
