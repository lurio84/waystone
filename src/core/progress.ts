/**
 * Progresión: XP, nivel y racha de días, todo DERIVADO de las carreras
 * terminadas. Puro, sin BD ni React. La XP y el nivel son una interpretación
 * (se recalculan y pueden moverse si `recalcRun` corrige una caché vieja);
 * las runas, que SÍ se persisten, viven en `runes.ts`.
 *
 * Todos los números de aquí (fórmula de XP, curva de nivel, nombres) están
 * pensados para tocarse: son puntos de ajuste, no constantes sagradas.
 */
import type { RunSummary } from './types';

// ─── XP ────────────────────────────────────────────────────────────────────

/**
 * XP de una carrera: 1 por cada 10 m recorridos + 5 por cada minuto en
 * movimiento. Una carrera de 5 km / 30 min ≈ 500 + 150 = 650 XP.
 */
export function xpForRun(run: RunSummary): number {
  return Math.round(run.distanceM / 10 + (run.movingTimeS / 60) * 5);
}

export function totalXp(runs: RunSummary[]): number {
  return runs.reduce((sum, r) => sum + xpForRun(r), 0);
}

// ─── Niveles ───────────────────────────────────────────────────────────────

/**
 * Nombres de nivel (nórdico romanizado — sin þ/ð/ø para que Cinzel los
 * renderice sin huecos). El nivel máximo es `LEVEL_NAMES.length`.
 */
export const LEVEL_NAMES: readonly string[] = [
  'Ferdamadr', //  1 — viajero
  'Gangari', //  2 — caminante
  'Rennari', //  3 — el que corre
  'Hlaupari', //  4 — corredor veloz
  'Vidforull', //  5 — el que va lejos (epíteto real)
  'Hradfari', //  6 — el rápido
  'Langforull', //  7 — el de las distancias largas
  'Tholinmodr', //  8 — el resistente
  'Stigandi', //  9 — el que asciende
  'Othreytandi', // 10 — el incansable
  'Stormgangari', // 11 — el que anda en la tormenta
  'Einherji', // 12 — el guerrero elegido de Valhalla
];

/** XP acumulada necesaria para ALCANZAR el nivel `n` (1-indexado). n≤1 → 0. */
export function xpForLevel(n: number): number {
  if (n <= 1) return 0;
  return Math.round(160 * (n - 1) ** 2);
}

export interface LevelProgress {
  /** 1 .. LEVEL_NAMES.length */
  level: number;
  name: string;
  totalXp: number;
  /** XP acumulada al empezar el nivel actual */
  xpAtLevelStart: number;
  /** XP acumulada para el siguiente nivel, o null si ya es el máximo */
  xpAtNextLevel: number | null;
  /** avance dentro del nivel actual, 0..1 (1 si es el máximo) */
  progress: number;
}

export function levelForXp(xp: number): LevelProgress {
  const maxLevel = LEVEL_NAMES.length;
  const safeXp = Math.max(0, xp);

  let level = 1;
  while (level < maxLevel && safeXp >= xpForLevel(level + 1)) level++;

  const xpAtLevelStart = xpForLevel(level);
  const xpAtNextLevel = level < maxLevel ? xpForLevel(level + 1) : null;
  const progress =
    xpAtNextLevel == null
      ? 1
      : (safeXp - xpAtLevelStart) / (xpAtNextLevel - xpAtLevelStart);

  return {
    level,
    name: LEVEL_NAMES[level - 1],
    totalXp: safeXp,
    xpAtLevelStart,
    xpAtNextLevel,
    progress,
  };
}

// ─── Racha de días ─────────────────────────────────────────────────────────

/** Clave de fecha local `YYYY-MM-DD` a partir de un epoch ms. */
function localDateKey(ts: number): string {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Suma `delta` días de calendario a `ts` (respeta cambios de mes y DST). */
function addLocalDays(ts: number, delta: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + delta).getTime();
}

/**
 * Días consecutivos con al menos una carrera, contando hacia atrás desde hoy.
 * Regla indulgente: si aún no has corrido HOY pero corriste AYER, la racha
 * sigue viva (se cuenta desde ayer). Se rompe en el primer día sin carrera.
 */
export function dayStreak(runs: RunSummary[], now: number = Date.now()): number {
  if (runs.length === 0) return 0;
  const days = new Set(runs.map((r) => localDateKey(r.startedAt)));

  let cursor = now;
  if (!days.has(localDateKey(cursor))) {
    cursor = addLocalDays(cursor, -1);
    if (!days.has(localDateKey(cursor))) return 0;
  }

  let streak = 0;
  while (days.has(localDateKey(cursor))) {
    streak++;
    cursor = addLocalDays(cursor, -1);
  }
  return streak;
}
