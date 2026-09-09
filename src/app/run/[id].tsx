import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { formatDateTime, formatDuration, formatKm, formatPace } from '@/core/format';
import { deleteRun, getRun, getSplits } from '@/db/runs';
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
          <ThemedText type="small" themeColor="textSecondary">
            {formatDateTime(run.startedAt)}
          </ThemedText>

          <View style={styles.headline}>
            <ThemedText style={styles.big}>{formatKm(run.distanceM)}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              KM
            </ThemedText>
          </View>

          <View style={styles.grid}>
            <Cell label="En movimiento" value={formatDuration(run.movingTimeS)} />
            <Cell label="Tiempo total" value={formatDuration(run.elapsedTimeS)} />
            <Cell label="Ritmo medio" value={`${formatPace(run.avgPaceSPerKm)} /km`} />
            <Cell label="Desnivel +" value={`${Math.round(run.elevGainM)} m`} />
          </View>

          <ThemedText type="subtitle" style={styles.sectionTitle}>
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
              style={[styles.exportBtn, { backgroundColor: theme.backgroundElement }]}
            >
              <ThemedText type="smallBold">Exportar GPX</ThemedText>
            </Pressable>
            <Pressable
              disabled={busy}
              onPress={withBusy(() => exportRunJson(runId))}
              style={[styles.exportBtn, { backgroundColor: theme.backgroundElement }]}
            >
              <ThemedText type="smallBold">Exportar JSON</ThemedText>
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
      <ThemedText type="small" themeColor="textSecondary">
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
  headline: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two },
  big: { fontSize: 60, lineHeight: 66, includeFontPadding: false, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginVertical: Spacing.two },
  cell: { width: '50%', paddingVertical: Spacing.two, gap: Spacing.half },
  cellValue: { fontSize: 24, lineHeight: 30, includeFontPadding: false, fontWeight: '700' },
  sectionTitle: { marginTop: Spacing.three },
  split: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  exports: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.four },
  exportBtn: { flex: 1, borderRadius: Spacing.three, paddingVertical: Spacing.three, alignItems: 'center' },
  delete: { alignItems: 'center', paddingVertical: Spacing.four },
});
