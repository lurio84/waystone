import { autoPauseIntervals, AutoPauseOptions, DEFAULT_AUTOPAUSE } from './autopause';
import { filterPoints, haversineMeters } from './geo';
import type { RawPoint } from './types';

/**
 * Ritmo "actual" suavizado sobre la última ventana de tiempo. Usa el
 * DESPLAZAMIENTO (línea recta entre el primer y el último punto de la ventana),
 * no la longitud del recorrido: sumando tramo a tramo, el baile del GPS
 * estando quieto acumula decenas de metros falsos y dispara el número. El
 * desplazamiento se anula solo con el ruido.
 *
 * Devuelve segundos por km, o 0 si no hay avance apreciable.
 */
export function currentPaceSPerKm(points: RawPoint[], windowS = 20): number {
  if (points.length < 2) return 0;
  const filtered = filterPoints(points);
  if (filtered.length < 2) return 0;

  const lastTs = filtered[filtered.length - 1].ts;
  const cutoff = lastTs - windowS * 1000;
  const window = filtered.filter((p) => p.ts >= cutoff);
  if (window.length < 2) return 0;

  const displacement = haversineMeters(window[0], window[window.length - 1]);
  const dtS = (window[window.length - 1].ts - window[0].ts) / 1000;
  // por debajo de ~10 m de avance en la ventana es ruido, no zancada
  if (displacement < 10 || dtS <= 0) return 0;

  return dtS / (displacement / 1000);
}

/**
 * ¿El corredor está parado ahora mismo según la autopausa? Se usa para el
 * indicador "EN PAUSA" de la pantalla de carrera. Misma lógica que la que
 * luego recalcula la carrera entera, así que no pueden divergir.
 */
export function isAutoPausedNow(
  points: RawPoint[],
  opts: AutoPauseOptions = DEFAULT_AUTOPAUSE,
): boolean {
  if (points.length < 2) return false;
  const intervals = autoPauseIntervals(points, opts);
  if (intervals.length === 0) return false;
  const last = intervals[intervals.length - 1];
  return last.end >= points[points.length - 1].ts;
}
