/**
 * Corrección del desnivel vía DEM (Digital Elevation Model). El GPS es
 * excelente en horizontal y muy pobre en vertical — sin corregir, el
 * "Desnivel +" que sale de la altitud del GPS sobreestima varias veces lo
 * que mide un DEM (medido: 131 m vs 8 m reales, 183 m vs 45 m reales).
 *
 * Este fichero es puro: no sabe de red ni de SQLite. `sampleForDem` decide
 * QUÉ puntos pedir; la capa de red (`src/elevation/dem.ts`) los pide y
 * devuelve un `ElevationProfile`; este fichero calcula el desnivel y sirve
 * de fuente para los parciales.
 */
import { haversineMeters } from './geo';
import type { RawPoint } from './types';

export interface ElevationSample {
  ts: number;
  elevation: number;
}

/**
 * Un perfil es una lista de TRAMOS contiguos — misma idea que
 * `routeSegments`: si dos muestras vecinas en el recorrido acumulado están
 * muy separadas en línea recta, es señal de un hueco/salto en los puntos de
 * origen, y suavizar o calcular ganancia CRUZANDO ese corte mezclaría
 * terreno que el corredor no pisó. Nunca se cruza un tramo al calcular.
 */
export type ElevationProfile = ElevationSample[][];

/** Resolución nativa de Copernicus DEM GLO-90: pedir más fino solo interpola ruido. */
export const DEFAULT_DEM_STEP_M = 90;

/** Media móvil ±1 muestra: calibrado contra 2 carreras reales (ver Waystone.md). */
export const DEFAULT_DEM_SMOOTH_WINDOW = 1;

const DEFAULT_ELEV_THRESHOLD_M = 1;

/** Por encima de esto (× el paso de muestreo) dos muestras vecinas se tratan como un corte. */
const STRAIGHT_LINE_BREAK_FACTOR = 3;

/**
 * Puntos a pedirle al DEM: uno cada `stepM` de recorrido acumulado (no de
 * tiempo ni de índice), más el último punto real si no coincide ya.
 */
export function sampleForDem(points: RawPoint[], stepM: number = DEFAULT_DEM_STEP_M): RawPoint[] {
  if (points.length === 0) return [];
  const out: RawPoint[] = [points[0]];
  let acc = 0;
  for (let i = 1; i < points.length; i++) {
    acc += haversineMeters(points[i - 1], points[i]);
    if (acc >= stepM) {
      out.push(points[i]);
      acc = 0;
    }
  }
  const last = points[points.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

/**
 * Parte una serie de puntos muestreados en tramos contiguos: corta donde el
 * salto en línea recta entre dos muestras vecinas es mucho mayor que el
 * paso de muestreo (un hueco/salto en los puntos de origen, no terreno real
 * entre medias). Se llama sobre los MISMOS puntos que `sampleForDem`
 * devuelve, antes de pedir elevación — el corte se decide con lat/lon.
 */
export function splitContiguousRuns(samples: RawPoint[], stepM: number = DEFAULT_DEM_STEP_M): RawPoint[][] {
  if (samples.length === 0) return [];
  const runs: RawPoint[][] = [[samples[0]]];
  const breakDistM = stepM * STRAIGHT_LINE_BREAK_FACTOR;
  for (let i = 1; i < samples.length; i++) {
    const jump = haversineMeters(samples[i - 1], samples[i]);
    if (jump > breakDistM) {
      runs.push([samples[i]]);
    } else {
      runs[runs.length - 1].push(samples[i]);
    }
  }
  return runs;
}

/** Media móvil centrada, recortada en los bordes (sin rellenar con ceros). */
export function smoothSeries(values: number[], window: number = DEFAULT_DEM_SMOOTH_WINDOW): number[] {
  if (window <= 0) return values;
  return values.map((_, i) => {
    const start = Math.max(0, i - window);
    const end = Math.min(values.length - 1, i + window);
    let sum = 0;
    let n = 0;
    for (let j = start; j <= end; j++) {
      sum += values[j];
      n++;
    }
    return sum / n;
  });
}

/**
 * Histéresis sobre desnivel positivo: un cambio solo cuenta si supera
 * `thresholdM` respecto a la última referencia, y esa referencia se mueve
 * tanto al subir como al bajar (así el ruido no se acumula en ningún
 * sentido). Mismo algoritmo que `elevationGainMeters` de `geo.ts`, aquí
 * sobre una serie de números en vez de `RawPoint[]`.
 */
function hysteresisGain(values: number[], thresholdM: number): number {
  let gain = 0;
  let ref: number | null = null;
  for (const v of values) {
    if (ref == null) {
      ref = v;
      continue;
    }
    const delta = v - ref;
    if (delta >= thresholdM) {
      gain += delta;
      ref = v;
    } else if (delta <= -thresholdM) {
      ref = v;
    }
  }
  return gain;
}

/**
 * Construye el perfil de elevación (suavizado, partido en tramos) a partir
 * de los puntos muestreados y las elevaciones devueltas por el DEM en el
 * mismo orden. `elevations.length` debe coincidir con `samples.length`.
 */
export function buildProfile(
  samples: RawPoint[],
  elevations: number[],
  opts: { stepM?: number; smoothWindow?: number } = {},
): ElevationProfile {
  const stepM = opts.stepM ?? DEFAULT_DEM_STEP_M;
  const smoothWindow = opts.smoothWindow ?? DEFAULT_DEM_SMOOTH_WINDOW;

  const runsOfPoints = splitContiguousRuns(samples, stepM);
  const profile: ElevationProfile = [];
  let idx = 0;
  for (const run of runsOfPoints) {
    const runElevs = elevations.slice(idx, idx + run.length);
    idx += run.length;
    const smoothed = smoothSeries(runElevs, smoothWindow);
    profile.push(run.map((p, i) => ({ ts: p.ts, elevation: smoothed[i] })));
  }
  return profile;
}

/** Desnivel + total del perfil: suma de la ganancia dentro de cada tramo, sin cruzar cortes. */
export function elevationGainFromProfile(
  profile: ElevationProfile,
  thresholdM: number = DEFAULT_ELEV_THRESHOLD_M,
): number {
  return profile.reduce((sum, run) => sum + hysteresisGain(run.map((s) => s.elevation), thresholdM), 0);
}

/** Elevación interpolada en `ts` dentro de un único tramo (ya se sabe que `ts` cae en su rango). */
function elevationAtInRun(run: ElevationSample[], ts: number): number {
  if (ts <= run[0].ts) return run[0].elevation;
  const last = run[run.length - 1];
  if (ts >= last.ts) return last.elevation;
  for (let i = 1; i < run.length; i++) {
    if (run[i].ts >= ts) {
      const a = run[i - 1];
      const b = run[i];
      const frac = b.ts === a.ts ? 0 : (ts - a.ts) / (b.ts - a.ts);
      return a.elevation + (b.elevation - a.elevation) * frac;
    }
  }
  return last.elevation;
}

/**
 * Desnivel + dentro de una ventana temporal (la usan los parciales). Si la
 * ventana cruza uno o más cortes del perfil, se calcula tramo a tramo y se
 * suma — nunca se deja que la histéresis vea una elevación interpolada
 * entre dos tramos no contiguos.
 */
export function elevationGainInWindow(
  profile: ElevationProfile,
  startTs: number,
  endTs: number,
  thresholdM: number = DEFAULT_ELEV_THRESHOLD_M,
): number {
  let gain = 0;
  for (const run of profile) {
    const runStart = run[0].ts;
    const runEnd = run[run.length - 1].ts;
    if (runEnd < startTs || runStart > endTs) continue; // este tramo no toca la ventana

    const windowStart = Math.max(startTs, runStart);
    const windowEnd = Math.min(endTs, runEnd);
    const inside = run.filter((s) => s.ts > windowStart && s.ts < windowEnd).map((s) => s.elevation);
    const series = [elevationAtInRun(run, windowStart), ...inside, elevationAtInRun(run, windowEnd)];
    gain += hysteresisGain(series, thresholdM);
  }
  return gain;
}
