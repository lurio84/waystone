import { useKeepAwake } from 'expo-keep-awake';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, AppState, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RouteMap } from '@/components/route-map';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { formatDuration, formatKm, formatPace } from '@/core/format';
import { useLiveMetrics } from '@/hooks/use-live-metrics';
import { useTheme } from '@/hooks/use-theme';
import { ensureTracking, pause, resume, stopRecording } from '@/tracking/recorder';
import { useSession } from '@/store/session';
import { useSettings } from '@/store/settings';

/** Cada cuánto el watchdog comprueba que el GPS sigue entregando puntos. */
const WATCHDOG_MS = 15_000;

export default function RecordScreen() {
  useKeepAwake();
  const theme = useTheme();
  const router = useRouter();
  const session = useSession();
  const metrics = useLiveMetrics(session.runId);
  const liveMap = useSettings((s) => s.liveMap);

  // Cronómetro de pared, independiente del muestreo del GPS.
  const [nowTs, setNowTs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Watchdog: si el GPS deja de entregar puntos (doze, kill del OEM, bug de
  // expo-location), reengancha las actualizaciones. También al volver a primer plano.
  useEffect(() => {
    const check = () => {
      ensureTracking().catch(() => {});
    };
    const id = setInterval(check, WATCHDOG_MS);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') check();
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, []);

  const elapsedS = session.startedAt ? (nowTs - session.startedAt) / 1000 : 0;
  const paused = session.status === 'paused';
  const showPausedBanner = paused || metrics.autoPaused;

  const onTogglePause = () => {
    if (paused) {
      resume();
      session.resume();
    } else {
      pause();
      session.pause();
    }
  };

  const onFinish = () => {
    Alert.alert('Terminar carrera', '¿Guardar y cerrar esta carrera?', [
      { text: 'Seguir', style: 'cancel' },
      {
        text: 'Terminar',
        style: 'destructive',
        onPress: async () => {
          const runId = await stopRecording();
          session.end();
          router.replace(runId ? `/run/${runId}` : '/');
        },
      },
    ]);
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        {showPausedBanner && (
          <View style={[styles.banner, { backgroundColor: theme.warn }]}>
            <ThemedText style={styles.bannerText} themeColor="background">
              {paused ? 'EN PAUSA' : 'PAUSA AUTOMÁTICA'}
            </ThemedText>
          </View>
        )}

        {liveMap && metrics.points.length >= 2 && (
          <RouteMap points={metrics.points} follow style={styles.map} />
        )}

        <View style={styles.main}>
          <View style={styles.distanceBlock}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
              DISTANCIA · KM
            </ThemedText>
            <ThemedText style={styles.distance}>{formatKm(metrics.distanceM)}</ThemedText>
          </View>

          <View style={styles.metricsGroup}>
            <View style={styles.pair}>
              <Metric label="TIEMPO" value={formatDuration(elapsedS)} />
              <Metric label="RITMO · /KM" value={formatPace(metrics.currentPaceSPerKm)} />
            </View>
            <View style={styles.pair}>
              <Metric label="EN MOVIMIENTO" value={formatDuration(metrics.movingTimeS)} />
              <Metric label="RITMO MEDIO" value={formatPace(metrics.avgPaceSPerKm)} />
            </View>
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable
            onPress={onTogglePause}
            style={[styles.btn, { backgroundColor: theme.backgroundElement }]}
          >
            <ThemedText style={styles.btnText}>{paused ? 'Reanudar' : 'Pausar'}</ThemedText>
          </Pressable>
          <Pressable onPress={onFinish} style={[styles.btn, { backgroundColor: theme.danger }]}>
            <ThemedText style={styles.btnText} themeColor="background">
              Terminar
            </ThemedText>
          </Pressable>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
        {label}
      </ThemedText>
      <ThemedText style={styles.metricValue}>{value}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  banner: { paddingVertical: Spacing.two, alignItems: 'center' },
  bannerText: { fontSize: 16, fontWeight: '800', letterSpacing: 1 },
  map: { height: '34%' },
  main: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    gap: Spacing.five,
  },
  label: { letterSpacing: 1.5, textAlign: 'center' },
  distanceBlock: { alignItems: 'center', gap: Spacing.two },
  distance: {
    fontSize: 92,
    lineHeight: 100,
    includeFontPadding: false,
    fontWeight: '800',
    textAlign: 'center',
  },
  metricsGroup: { gap: Spacing.four },
  pair: { flexDirection: 'row' },
  metric: { flex: 1, alignItems: 'center', gap: Spacing.one },
  metricValue: {
    fontSize: 38,
    lineHeight: 44,
    includeFontPadding: false,
    fontWeight: '700',
  },
  actions: { flexDirection: 'row', gap: Spacing.two, padding: Spacing.three },
  btn: { flex: 1, borderRadius: Spacing.four, paddingVertical: Spacing.four, alignItems: 'center' },
  btnText: { fontSize: 20, fontWeight: '700' },
});
