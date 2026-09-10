import { useKeepAwake } from 'expo-keep-awake';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, AppState, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RouteMap } from '@/components/route-map';
import { StonePanel } from '@/components/stone-panel';
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

  // Muescas en el canto de la piedra: una por km cerrado. El mojón marca distancia.
  const km = Math.max(0, Math.floor(metrics.distanceM / 1000));
  const notches = useMemo(() => Array.from({ length: km }), [km]);

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
            <ThemedText type="inscription" themeColor="background" style={styles.bannerText}>
              {paused ? 'En pausa' : 'Pausa automática'}
            </ThemedText>
          </View>
        )}

        {liveMap && metrics.points.length >= 2 && (
          <RouteMap points={metrics.points} follow style={styles.map} />
        )}

        <View style={styles.main}>
          <StonePanel tone="backgroundElement" style={styles.face}>
            <ThemedText type="inscription" themeColor="textSecondary">
              Distancia
            </ThemedText>
            <View style={styles.distanceRow}>
              <ThemedText style={[styles.distance, { color: theme.text }]}>
                {formatKm(metrics.distanceM)}
              </ThemedText>
              <ThemedText type="inscription" themeColor="textSecondary" style={styles.unit}>
                km
              </ThemedText>
            </View>
            {km > 0 && (
              <View style={styles.notches}>
                {notches.map((_, i) => (
                  <View key={i} style={[styles.notch, { backgroundColor: theme.warn }]} />
                ))}
              </View>
            )}
          </StonePanel>

          <View style={styles.metricsGroup}>
            <View style={styles.pair}>
              <Metric label="Tiempo" value={formatDuration(elapsedS)} />
              <Metric label="Ritmo /km" value={formatPace(metrics.currentPaceSPerKm)} />
            </View>
            <View style={styles.pair}>
              <Metric label="En movimiento" value={formatDuration(metrics.movingTimeS)} />
              <Metric label="Ritmo medio" value={formatPace(metrics.avgPaceSPerKm)} />
            </View>
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable
            onPress={onTogglePause}
            style={[styles.btn, { backgroundColor: theme.backgroundSelected }]}
          >
            <ThemedText type="inscription" style={styles.btnText}>
              {paused ? 'Reanudar' : 'Pausar'}
            </ThemedText>
          </Pressable>
          <Pressable onPress={onFinish} style={[styles.btn, { backgroundColor: theme.danger }]}>
            <ThemedText type="inscription" themeColor="text" style={styles.btnText}>
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
      <ThemedText type="inscription" themeColor="textSecondary">
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
  bannerText: { fontSize: 13, letterSpacing: 3 },
  map: { height: '30%' },
  main: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    gap: Spacing.five,
  },
  face: {
    alignItems: 'center',
    paddingVertical: Spacing.five,
    gap: Spacing.two,
  },
  distanceRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two },
  distance: {
    fontSize: 88,
    lineHeight: 92,
    includeFontPadding: false,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  unit: { paddingBottom: Spacing.three, fontSize: 14, letterSpacing: 2 },
  notches: { flexDirection: 'row', gap: Spacing.one, marginTop: Spacing.two },
  notch: { width: 3, height: 14 },
  metricsGroup: { gap: Spacing.four },
  pair: { flexDirection: 'row' },
  metric: { flex: 1, alignItems: 'center', gap: Spacing.one },
  metricValue: {
    fontSize: 34,
    lineHeight: 40,
    includeFontPadding: false,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  actions: { flexDirection: 'row', gap: Spacing.two, padding: Spacing.three },
  btn: { flex: 1, paddingVertical: Spacing.four, alignItems: 'center' },
  btnText: { fontSize: 15, letterSpacing: 3 },
});
