import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StonePanel } from '@/components/stone-panel';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { formatDateTime } from '@/core/format';
import { dayStreak, levelForXp, totalXp, type LevelProgress } from '@/core/progress';
import { RUNES } from '@/core/runes';
import { getUnlockedAchievements, syncAchievements } from '@/db/achievements';
import { listAllRuns, runRowToSummary } from '@/db/runs';
import { useTheme } from '@/hooks/use-theme';
import { useProgressSeen } from '@/store/progress-seen';

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
  const lastSeenLevel = useProgressSeen((s) => s.lastSeenLevel);
  const markLevelSeen = useProgressSeen((s) => s.markLevelSeen);
  const hasHydrated = useProgressSeen((s) => s.hasHydrated);

  // La barra de XP crece desde 0 al entrar; el pulso ámbar solo si el nivel
  // ha subido desde la última vez que se vio el perfil.
  const fill = useSharedValue(0);
  const glow = useSharedValue(0);

  useFocusEffect(
    useCallback(() => {
      // Reintento del sync: si una carrera se cerró con una versión sin
      // `syncAchievements` (o el best-effort de `stopRecording` falló), aquí
      // se persisten las runas que le tocaban. Append-only e idempotente.
      try {
        syncAchievements(listAllRuns());
      } catch {
        // pintar el perfil aunque el sync falle
      }
      setData(load());
    }, []),
  );

  const { level, streak, runCount, unlocked } = data;

  // La barra crece hasta su valor. Efecto propio (no en `useFocusEffect`: el
  // compilador de React no deja mutar un shared value en el `useCallback` de un
  // hook) y con SOLO `level.progress` en deps — si `markLevelSeen` estuviera
  // aquí, el pulso reiniciaría la barra a media animación.
  useEffect(() => {
    fill.value = 0;
    fill.value = withTiming(level.progress, {
      duration: 650,
      easing: Easing.out(Easing.cubic),
      reduceMotion: ReduceMotion.System,
    });
  }, [level.progress, fill]);

  // Pulso ámbar solo si el nivel ha subido desde la última vez que se vio el
  // perfil. Al marcarlo visto `lastSeenLevel` cambia y el efecto re-corre, pero
  // ya no cumple la condición → no repite.
  //
  // Gateado con `hasHydrated`: el store persiste con AsyncStorage y arranca
  // en el default (`lastSeenLevel: 1`) hasta que rehidrata, un tick después
  // del mount. Sin este guard, un cold start pillaba `lastSeenLevel` todavía
  // en 1 y disparaba el pulso en falso cada vez que se abría Perfil, aunque
  // el nivel llevara tiempo visto (persistido).
  useEffect(() => {
    if (!hasHydrated) return;
    if (level.level > lastSeenLevel) {
      glow.value = withSequence(
        withTiming(1, { duration: 200, reduceMotion: ReduceMotion.System }),
        withTiming(0, { duration: 550, reduceMotion: ReduceMotion.System }),
        withTiming(1, { duration: 200, reduceMotion: ReduceMotion.System }),
        withTiming(0, { duration: 650, reduceMotion: ReduceMotion.System }),
      );
      markLevelSeen(level.level);
    }
  }, [hasHydrated, level.level, lastSeenLevel, markLevelSeen, glow]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value * 0.16 }));
  const xpLine =
    level.xpAtNextLevel == null
      ? `${level.totalXp} XP · nivel máximo`
      : `${level.totalXp} / ${level.xpAtNextLevel} XP`;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View>
            <StonePanel style={styles.levelPanel}>
              <ThemedText type="inscription" themeColor="textSecondary">
                Nivel {level.level}
              </ThemedText>
              <ThemedText type="inscription" style={styles.levelName}>
                {level.name}
              </ThemedText>

              <View style={[styles.track, { backgroundColor: theme.background }]}>
                <Animated.View
                  style={[styles.fill, { backgroundColor: theme.primary }, fillStyle]}
                />
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                {xpLine}
              </ThemedText>
            </StonePanel>
            <Animated.View
              pointerEvents="none"
              style={[StyleSheet.absoluteFill, { backgroundColor: theme.warn }, glowStyle]}
            />
          </View>

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
