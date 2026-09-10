import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StonePanel } from '@/components/stone-panel';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { formatDateTime } from '@/core/format';
import { dayStreak, levelForXp, totalXp, type LevelProgress } from '@/core/progress';
import { RUNES } from '@/core/runes';
import { getUnlockedAchievements } from '@/db/achievements';
import { listAllRuns, runRowToSummary } from '@/db/runs';
import { useTheme } from '@/hooks/use-theme';

interface ProfileData {
  level: LevelProgress;
  streak: number;
  runCount: number;
  /** id de runa → epoch ms en que se desbloqueó */
  unlocked: Map<string, number>;
}

/** Todo derivado de la caché de `runs` + la tabla `achievements`. Barato. */
function load(): ProfileData {
  const summaries = listAllRuns().map(runRowToSummary);
  return {
    level: levelForXp(totalXp(summaries)),
    streak: dayStreak(summaries),
    runCount: summaries.length,
    unlocked: new Map(getUnlockedAchievements().map((u) => [u.id, u.unlockedAt])),
  };
}

export default function ProfileScreen() {
  const theme = useTheme();
  const [data, setData] = useState<ProfileData>(load);

  useFocusEffect(useCallback(() => setData(load()), []));

  const { level, streak, runCount, unlocked } = data;
  const xpLine =
    level.xpAtNextLevel == null
      ? `${level.totalXp} XP · nivel máximo`
      : `${level.totalXp} / ${level.xpAtNextLevel} XP`;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <StonePanel style={styles.levelPanel}>
            <ThemedText type="inscription" themeColor="textSecondary">
              Nivel {level.level}
            </ThemedText>
            <ThemedText type="inscription" style={styles.levelName}>
              {level.name}
            </ThemedText>

            <View style={[styles.track, { backgroundColor: theme.background }]}>
              <View
                style={[
                  styles.fill,
                  { backgroundColor: theme.primary, width: `${Math.round(level.progress * 100)}%` },
                ]}
              />
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              {xpLine}
            </ThemedText>
          </StonePanel>

          <View style={styles.factRow}>
            <Fact value={String(streak)} label={streak === 1 ? 'día de racha' : 'días de racha'} />
            <Fact value={String(runCount)} label={runCount === 1 ? 'carrera' : 'carreras'} />
          </View>

          <ThemedText type="inscription" themeColor="textSecondary" style={styles.sectionTitle}>
            Runas
          </ThemedText>
          {RUNES.map((rune) => {
            const at = unlocked.get(rune.id);
            const isUnlocked = at != null;
            return (
              <View
                key={rune.id}
                style={[styles.rune, { borderColor: theme.backgroundSelected }]}
              >
                <View
                  style={[
                    styles.runeMark,
                    { backgroundColor: isUnlocked ? theme.warn : theme.backgroundSelected },
                  ]}
                />
                <View style={styles.runeBody}>
                  <ThemedText
                    type="smallBold"
                    themeColor={isUnlocked ? 'text' : 'textSecondary'}
                  >
                    {rune.titulo}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {rune.descripcion}
                  </ThemedText>
                  {isUnlocked && (
                    <ThemedText type="small" themeColor="textSecondary">
                      {formatDateTime(at)}
                    </ThemedText>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function Fact({ value, label }: { value: string; label: string }) {
  return (
    <StonePanel style={styles.fact} carved={false} tone="backgroundSelected">
      <ThemedText style={styles.factValue}>{value}</ThemedText>
      <ThemedText type="inscription" themeColor="textSecondary">
        {label}
      </ThemedText>
    </StonePanel>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  scroll: { padding: Spacing.three, gap: Spacing.two },
  levelPanel: { gap: Spacing.two },
  levelName: { fontSize: 26, lineHeight: 32, letterSpacing: 2 },
  track: { height: 8, marginTop: Spacing.one },
  fill: { height: 8, minWidth: 2 },
  factRow: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two },
  fact: { flex: 1, alignItems: 'center', gap: Spacing.one },
  factValue: {
    fontSize: 34,
    lineHeight: 40,
    includeFontPadding: false,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  sectionTitle: { marginTop: Spacing.four, fontSize: 13, letterSpacing: 3 },
  rune: {
    flexDirection: 'row',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  runeMark: { width: 4, alignSelf: 'stretch' },
  runeBody: { flex: 1, gap: Spacing.half },
});
