import { haversineMeters } from './geo';
import type { Interval, RawPoint } from './types';

export interface AutoPauseOptions {
  /** por debajo de esta velocidad se considera "parado" (m/s) */
  pauseSpeedMs: number;
  /** hay que estar lento este tiempo seguido para entrar en pausa (s) */
  pauseAfterS: number;
  /** por encima de esta velocidad se considera "en marcha" (m/s) */
  resumeSpeedMs: number;
  /** hay que estar en marcha este tiempo seguido para salir de pausa (s) */
  resumeAfterS: number;
}

/**
 * Histéresis: los umbrales de entrada y salida son distintos a propósito.
 * Con un solo umbral, en un semáforo el estado parpadea pausa/marcha con
 * cada bandazo del GPS.
 */
export const DEFAULT_AUTOPAUSE: AutoPauseOptions = {
  pauseSpeedMs: 0.8,
  pauseAfterS: 8,
  resumeSpeedMs: 1.4,
  resumeAfterS: 3,
};

/** Velocidad instantánea de un punto: la del GPS si la da, si no la derivada. */
function speedAt(prev: RawPoint | undefined, p: RawPoint): number {
  if (p.speed != null && p.speed >= 0) return p.speed;
  if (!prev) return 0;
  const dtS = (p.ts - prev.ts) / 1000;
  if (dtS <= 0) return 0;
  return haversineMeters(prev, p) / dtS;
}

/**
 * Deduce los intervalos en que el corredor estuvo parado, a partir de la
 * secuencia de puntos. Función pura y determinista: la misma entrada da
 * siempre la misma salida, se ejecute en vivo o al recalcular una carrera
 * vieja. No lee ni escribe nada persistente.
 *
 * Los intervalos devueltos van en orden y no se solapan.
 */
export function autoPauseIntervals(
  points: RawPoint[],
  opts: AutoPauseOptions = DEFAULT_AUTOPAUSE,
): Interval[] {
  if (points.length < 2) return [];

  const intervals: Interval[] = [];
  let state: 'moving' | 'paused' = 'moving';
  let slowSince: number | null = null;
  let fastSince: number | null = null;
  let pauseStart: number | null = null;

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const v = speedAt(points[i - 1], p);

    if (state === 'moving') {
      if (v < opts.pauseSpeedMs) {
        if (slowSince == null) slowSince = p.ts;
        if (p.ts - slowSince >= opts.pauseAfterS * 1000) {
          state = 'paused';
          pauseStart = slowSince; // la pausa empezó cuando empezó la lentitud
          fastSince = null;
        }
      } else {
        slowSince = null;
      }
    } else {
      if (v > opts.resumeSpeedMs) {
        if (fastSince == null) fastSince = p.ts;
        if (p.ts - fastSince >= opts.resumeAfterS * 1000) {
          intervals.push({ start: pauseStart as number, end: fastSince });
          state = 'moving';
          pauseStart = null;
          slowSince = null;
        }
      } else {
        fastSince = null;
      }
    }
  }

  if (state === 'paused' && pauseStart != null) {
    intervals.push({ start: pauseStart, end: points[points.length - 1].ts });
  }

  return intervals;
}
