import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RouteMap } from '@/components/route-map';
import { StonePanel } from '@/components/stone-panel';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { formatDateTime, formatDuration, formatKm, formatPace } from '@/core/format';
import { routePoints } from '@/core/metrics';
import { runesForRun } from '@/core/runes';
import { getUnlockedAchievements } from '@/db/achievements';
import { deleteRun, getEvents, getPoints, getRun, getSplits } from '@/db/runs';
import { useTheme } from '@/hooks/use-theme';
import { exportRunGpx, exportRunJson } from '@/export/export-run';

export default function RunDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const runId = Number(id);
  const theme = useTheme();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const run = useMemo(() => getRun(runId), [runId]);
  const splits = useMemo(() => getSplits(runId), [runId]);

  // Runas que ganó ESTA carrera, derivadas de lo persistido en `achievements`.
  // No es un aviso puntual: sale cada vez que se abre la carrera, y sobrevive a
  // que el proceso muera justo tras cerrarla.
  const startedAt = run?.startedAt;
  const runes = useMemo(
    () => (startedAt == null ? [] : runesForRun(getUnlockedAchievements(), runId, startedAt)),
    [runId, startedAt],
  );
  const route = useMemo(
    () =>
      routePoints(getPoints(runId), getEvents(runId), {
        startedAt: run?.startedAt,
        endedAt: run?.endedAt ?? undefined,
      }),
    [runId, run?.startedAt, run?.endedAt],
  );

  if (!run) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safe}>
          <ThemedText>Carrera no encontrada.</ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  const onDelete = () => {
    Alert.alert('Borrar carrera', 'Esto no se puede deshacer.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: () => {
          deleteRun(runId);
          router.back();
        },
      },
    ]);
  };

  const withBusy = (fn: () => Promise<void>) => async () => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <ThemedText type="inscription" themeColor="textSecondary">
            {formatDateTime(run.startedAt)}
          </ThemedText>

          {runes.length > 0 && (
            <StonePanel tone="backgroundSelected" style={styles.runeBanner}>
              <ThemedText
                type="inscription"
                style={[styles.runeBannerTitle, { color: theme.warn }]}
              >
                {runes.length === 1 ? 'Runa de esta carrera' : 'Runas de esta carrera'}
              </ThemedText>
              {runes.map((r) => (
                <View key={r.id} style={styles.runeItem}>
                  <ThemedText type="smallBold">{r.titulo}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {r.descripcion}
                  </ThemedText>
                </View>
              ))}
            </StonePanel>
          )}

          {route.length >= 2 && (
            <RouteMap points={route} style={styles.map} />
          )}

          <StonePanel style={styles.summary}>
            <View style={styles.headline}>
              <ThemedText style={styles.big}>{formatKm(run.distanceM)}</ThemedText>
              <ThemedText type="inscription" themeColor="textSecondary" style={styles.unit}>
                km
              </ThemedText>
            </View>

            <View style={styles.grid}>
              <Cell label="En movimiento" value={formatDuration(run.movingTimeS)} />
              <Cell label="Tiempo total" value={formatDuration(run.elapsedTimeS)} />
              <Cell label="Ritmo medio" value={`${formatPace(run.avgPaceSPerKm)} /km`} />
              {/* GPS sin corrección DEM sobreestima el desnivel; el número es orientativo. */}
              <Cell label="Desnivel +" value={`≈ ${Math.round(run.elevGainM)} m`} />
            </View>
          </StonePanel>

          <ThemedText type="inscription" themeColor="textSecondary" style={styles.sectionTitle}>
            Parciales
          </ThemedText>
          {splits.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              Carrera demasiado corta para parciales.
            </ThemedText>
          ) : (
            splits.map((s) => (
              <View
                key={s.id}
                style={[styles.split, { borderColor: theme.backgroundSelected }]}
              >
                <ThemedText type="smallBold">
                  {s.distanceM >= 1000 ? `km ${s.kmIndex + 1}` : `+${Math.round(s.distanceM)} m`}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {formatDuration(s.durationS)}
                </ThemedText>
                <ThemedText type="smallBold">{formatPace(s.paceSPerKm)} /km</ThemedText>
              </View>
            ))
          )}

          <View style={styles.exports}>
            <Pressable
              disabled={busy}
              onPress={withBusy(() => exportRunGpx(runId))}
              style={[styles.exportBtn, { backgroundColor: theme.backgroundSelected }]}
            >
              <ThemedText type="inscription" style={styles.exportLabel}>Exportar GPX</ThemedText>
            </Pressable>
            <Pressable
              disabled={busy}
              onPress={withBusy(() => exportRunJson(runId))}
              style={[styles.exportBtn, { backgroundColor: theme.backgroundSelected }]}
            >
              <ThemedText type="inscription" style={styles.exportLabel}>Exportar JSON</ThemedText>
            </Pressable>
          </View>

          <Pressable onPress={onDelete} style={styles.delete}>
            <ThemedText type="smallBold" themeColor="danger">
              Borrar carrera
            </ThemedText>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.cell}>
      <ThemedText type="inscription" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText style={styles.cellValue}>{value}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  scroll: { padding: Spacing.three, gap: Spacing.two },
  map: { height: 260, marginVertical: Spacing.two },
  runeBanner: { gap: Spacing.two, marginTop: Spacing.two },
  runeBannerTitle: { fontSize: 13, letterSpacing: 3 },
  runeItem: { gap: Spacing.half },
  summary: { gap: Spacing.two },
  headline: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two },
  big: {
    fontSize: 60,
    lineHeight: 66,
    includeFontPadding: false,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  unit: { paddingBottom: Spacing.two, fontSize: 13, letterSpacing: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '50%', paddingVertical: Spacing.two, gap: Spacing.half },
  cellValue: {
    fontSize: 24,
    lineHeight: 30,
    includeFontPadding: false,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  sectionTitle: { marginTop: Spacing.three, fontSize: 13, letterSpacing: 3 },
  split: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  exports: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.four },
  exportBtn: { flex: 1, paddingVertical: Spacing.three, alignItems: 'center' },
  exportLabel: { fontSize: 12, letterSpacing: 2 },
  delete: { alignItems: 'center', paddingVertical: Spacing.four },
});
