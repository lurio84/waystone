import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StonePanel } from '@/components/stone-panel';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { formatDateTime, formatDuration, formatKm, formatPace } from '@/core/format';
import { listRuns } from '@/db/runs';
import type { RunRow } from '@/db/schema';

export default function RunsScreen() {
  const router = useRouter();
  const [runs, setRuns] = useState<RunRow[]>([]);

  useFocusEffect(useCallback(() => setRuns(listRuns(500)), []));

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <FlatList
          data={runs}
          keyExtractor={(r) => String(r.id)}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <ThemedText type="small" themeColor="textSecondary">
              Aún no has grabado ninguna carrera.
            </ThemedText>
          }
          renderItem={({ item: r }) => (
            <Pressable onPress={() => router.push(`/run/${r.id}`)}>
              <StonePanel style={styles.row}>
                <ThemedText type="inscription" themeColor="textSecondary">
                  {formatDateTime(r.startedAt)}
                </ThemedText>
                <View style={styles.stats}>
                  <ThemedText type="subtitle">{formatKm(r.distanceM)} km</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {formatDuration(r.movingTimeS)} · {formatPace(r.avgPaceSPerKm)} /km
                  </ThemedText>
                </View>
              </StonePanel>
            </Pressable>
          )}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  list: { padding: Spacing.three, gap: Spacing.two },
  row: { gap: Spacing.one },
  stats: { gap: Spacing.half },
});
