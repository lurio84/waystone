import { autoPauseIntervals, AutoPauseOptions, DEFAULT_AUTOPAUSE } from './autopause';
import {
  elevationGainMeters,
  filterPoints,
  haversineMeters,
  pathDistanceMeters,
} from './geo';
import type { Interval, RawPoint, RunEvent, RunMetrics, Split } from './types';

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
  if (points.length < 2) return empty;

  const startTs = points[0].ts;
  const endTs = points[points.length - 1].ts;
  const elapsedMs = endTs - startTs;

  const filtered = filterPoints(points);
  const distanceM = pathDistanceMeters(filtered);
  const elevGainM = elevationGainMeters(filtered);

  const pauses = allPauses(points, events, endTs, opts.autopause ?? DEFAULT_AUTOPAUSE);
  const pausedMs = pausedMsWithin(pauses, startTs, endTs);
  const movingMs = Math.max(0, elapsedMs - pausedMs);

  const avgPaceSPerKm =
    distanceM > 0 ? movingMs / 1000 / (distanceM / 1000) : 0;

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
  const filtered = filterPoints(points);
  if (filtered.length < 2) return [];

  const endTs = points.length ? points[points.length - 1].ts : filtered[filtered.length - 1].ts;
  const pauses = allPauses(points, events, endTs, opts.autopause ?? DEFAULT_AUTOPAUSE);

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
    const segLen = haversineMeters(a, b);

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

  // resto final (parcial incompleto)
  const tail = cumDist - (nextMark - splitMeters);
  if (tail > 1) {
    pushSplit(filtered[filtered.length - 1].ts, tail, splits.length);
  }

  return splits;
}
