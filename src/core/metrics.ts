import { autoPauseIntervals, AutoPauseOptions, DEFAULT_AUTOPAUSE } from './autopause';
import { elevationGainMeters, filterPoints, haversineMeters } from './geo';
import type { Interval, RawPoint, RunEvent, RunMetrics, Split } from './types';

/**
 * Distancia mínima (m) por debajo de la cual no se calcula ritmo: con menos
 * que esto lo que hay es ruido de GPS, y un ritmo sacado de ruido engaña más
 * que un guión.
 */
export const MIN_PACE_DISTANCE_M = 50;

function tsInAnyInterval(ts: number, intervals: Interval[]): boolean {
  for (const iv of intervals) {
    if (ts >= iv.start && ts <= iv.end) return true;
  }
  return false;
}

/**
 * Distancia recorrida EN MOVIMIENTO: suma los tramos entre puntos consecutivos
 * salvo los que caen dentro de una pausa (manual o automática). Estando parado
 * el GPS deriva metros; sin este filtro esa deriva se cuenta como distancia y
 * dispara el ritmo a valores imposibles.
 */
export function movingDistanceMeters(points: RawPoint[], pauses: Interval[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (tsInAnyInterval(a.ts, pauses) || tsInAnyInterval(b.ts, pauses)) continue;
    total += haversineMeters(a, b);
  }
  return total;
}

/** Empareja los eventos manuales pause/resume en intervalos cerrados. */
export function manualPauseIntervals(events: RunEvent[], runEndTs: number): Interval[] {
  const sorted = [...events].sort((a, b) => a.ts - b.ts);
  const intervals: Interval[] = [];
  let open: number | null = null;

  for (const e of sorted) {
    if (e.kind === 'pause' && open == null) {
      open = e.ts;
    } else if (e.kind === 'resume' && open != null) {
      intervals.push({ start: open, end: e.ts });
      open = null;
    }
  }
  if (open != null) intervals.push({ start: open, end: runEndTs });

  return intervals;
}

/** Une intervalos solapados o contiguos en una lista mínima y ordenada. */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const out: Interval[] = [{ ...sorted[0] }];

  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i];
    const last = out[out.length - 1];
    if (cur.start <= last.end) {
      last.end = Math.max(last.end, cur.end);
    } else {
      out.push({ ...cur });
    }
  }
  return out;
}

/** Milisegundos de pausa (ya fusionada) que caen dentro de [from, to]. */
export function pausedMsWithin(merged: Interval[], from: number, to: number): number {
  let ms = 0;
  for (const iv of merged) {
    const start = Math.max(iv.start, from);
    const end = Math.min(iv.end, to);
    if (end > start) ms += end - start;
  }
  return ms;
}

/**
 * Todas las pausas de una carrera: las que pulsó el usuario más las que
 * deduce la autopausa, fusionadas.
 */
export function allPauses(
  points: RawPoint[],
  events: RunEvent[],
  runEndTs: number,
  autopause: AutoPauseOptions = DEFAULT_AUTOPAUSE,
): Interval[] {
  return mergeIntervals([
    ...manualPauseIntervals(events, runEndTs),
    ...autoPauseIntervals(points, autopause),
  ]);
}

export interface MetricsOptions {
  autopause?: AutoPauseOptions;
  /** epoch ms del inicio real de la carrera (columna `runs.started_at`). */
  startedAt?: number;
  /** epoch ms del "Terminar" (columna `runs.ended_at`). */
  endedAt?: number;
}

/**
 * Descarta el punto fantasma del arranque: expo-location entrega como primer
 * punto la última ubicación conocida, con su timestamp ORIGINAL (se han visto
 * −483 s y −565 s antes de `startedAt`). Sin filtrarlo, la ventana temporal se
 * deriva de ese ts viejo e infla el tiempo transcurrido.
 */
function trimPreStart(points: RawPoint[], startedAt: number | undefined): RawPoint[] {
  if (startedAt == null) return points;
  return points.filter((p) => p.ts >= startedAt);
}

/**
 * Instante de fin de la carrera para el cálculo de la ventana temporal:
 * el "Terminar" acotado al último punto real. Si el P0 mató la grabación a
 * media y el usuario pulsa Terminar al llegar a casa, `endedAt` está 30-60 min
 * por delante del último fix — sin el clamp eso infla el tiempo. Con él, una
 * carrera limpia da el tiempo real y una matada da el tiempo hasta que murió.
 */
function boundedEndTs(lastPointTs: number, endedAt: number | undefined): number {
  return endedAt != null ? Math.min(endedAt, lastPointTs) : lastPointTs;
}

/** Métricas agregadas de una carrera a partir de sus puntos crudos y eventos. */
export function computeMetrics(
  points: RawPoint[],
  events: RunEvent[],
  opts: MetricsOptions = {},
): RunMetrics {
  const empty: RunMetrics = {
    distanceM: 0,
    movingTimeS: 0,
    elapsedTimeS: 0,
    avgPaceSPerKm: 0,
    elevGainM: 0,
  };

  const pts = trimPreStart(points, opts.startedAt);
  if (pts.length < 2) return empty;

  const startTs = opts.startedAt ?? pts[0].ts;
  const endTs = boundedEndTs(pts[pts.length - 1].ts, opts.endedAt);
  const elapsedMs = Math.max(0, endTs - startTs);

  const filtered = filterPoints(pts);
  const pauses = allPauses(pts, events, endTs, opts.autopause ?? DEFAULT_AUTOPAUSE);

  const distanceM = movingDistanceMeters(filtered, pauses);
  const elevGainM = elevationGainMeters(filtered);

  const pausedMs = pausedMsWithin(pauses, startTs, endTs);
  const movingMs = Math.max(0, elapsedMs - pausedMs);

  const avgPaceSPerKm =
    distanceM >= MIN_PACE_DISTANCE_M ? movingMs / 1000 / (distanceM / 1000) : 0;

  return {
    distanceM,
    movingTimeS: movingMs / 1000,
    elapsedTimeS: elapsedMs / 1000,
    avgPaceSPerKm,
    elevGainM,
  };
}

/**
 * Parciales por distancia (1 km por defecto). El instante en que se cruza
 * cada marca se interpola linealmente entre los dos puntos que la rodean,
 * en vez de coger el punto más cercano: con muestreo de 1 s eso son hasta
 * varios metros de error por parcial acumulándose.
 */
export function computeSplits(
  points: RawPoint[],
  events: RunEvent[],
  splitMeters = 1000,
  opts: MetricsOptions = {},
): Split[] {
  // Se recorta el punto fantasma igual que en computeMetrics, pero los
  // parciales siguen anclados a timestamps de puntos (no a `startedAt`): así
  // el km 1 no carga con los segundos de adquisición del primer fix.
  const pts = trimPreStart(points, opts.startedAt);
  const filtered = filterPoints(pts);
  if (filtered.length < 2) return [];

  const lastTs = pts.length ? pts[pts.length - 1].ts : filtered[filtered.length - 1].ts;
  const endTs = boundedEndTs(lastTs, opts.endedAt);
  const pauses = allPauses(pts, events, endTs, opts.autopause ?? DEFAULT_AUTOPAUSE);

  const splits: Split[] = [];
  let cumDist = 0;
  let nextMark = splitMeters;
  let segStartTs = filtered[0].ts;
  let segElevRef = filtered[0].altitude;
  let segElevGain = 0;

  const pushSplit = (endTsMark: number, distanceM: number, kmIndex: number) => {
    const wallMs = endTsMark - segStartTs;
    const movingMs = Math.max(0, wallMs - pausedMsWithin(pauses, segStartTs, endTsMark));
    const durationS = movingMs / 1000;
    splits.push({
      kmIndex,
      distanceM,
      durationS,
      paceSPerKm: distanceM > 0 ? durationS / (distanceM / 1000) : 0,
      elevGainM: segElevGain,
    });
  };

  for (let i = 1; i < filtered.length; i++) {
    const a = filtered[i - 1];
    const b = filtered[i];
    // los tramos dentro de una pausa no cuentan distancia (misma regla que las métricas)
    const paused = tsInAnyInterval(a.ts, pauses) || tsInAnyInterval(b.ts, pauses);
    const segLen = paused ? 0 : haversineMeters(a, b);

    // desnivel dentro del tramo actual
    if (b.altitude != null) {
      if (segElevRef == null) segElevRef = b.altitude;
      else {
        const d = b.altitude - segElevRef;
        if (d >= 1) {
          segElevGain += d;
          segElevRef = b.altitude;
        } else if (d <= -1) {
          segElevRef = b.altitude;
        }
      }
    }

    // ¿este tramo cruza una o más marcas de km?
    while (segLen > 0 && cumDist + segLen >= nextMark) {
      const frac = (nextMark - cumDist) / segLen;
      const crossTs = a.ts + (b.ts - a.ts) * frac;
      pushSplit(crossTs, splitMeters, splits.length);

      segStartTs = crossTs;
      segElevGain = 0;
      segElevRef = b.altitude ?? segElevRef;
      nextMark += splitMeters;
    }

    cumDist += segLen;
  }

  // resto final (parcial incompleto); se ignora si es un residuo de pocos metros
  const tail = cumDist - (nextMark - splitMeters);
  if (tail >= 20) {
    pushSplit(filtered[filtered.length - 1].ts, tail, splits.length);
  }

  return splits;
}
