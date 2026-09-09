import type { RawPoint } from './types';

/** Descarta puntos con precisión peor que esto (metros). */
export const MAX_ACCURACY_M = 25;

/** Velocidad instantánea implícita por encima de la cual el tramo es un salto de GPS, no una zancada (m/s). ~25 km/h. */
export const MAX_PLAUSIBLE_SPEED_MS = 7;

const EARTH_RADIUS_M = 6_371_000;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** Distancia sobre la esfera entre dos coordenadas, en metros. */
export function haversineMeters(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Filtra una secuencia de puntos crudos para medir distancia:
 *  - descarta los que no tienen precisión o la tienen peor que MAX_ACCURACY_M
 *  - descarta el punto si el salto desde el último aceptado implica una
 *    velocidad imposible corriendo (típico teletransporte del GPS en túneles
 *    o entre edificios)
 *
 * No modifica los puntos; devuelve un subconjunto en el mismo orden.
 */
export function filterPoints(points: RawPoint[]): RawPoint[] {
  const kept: RawPoint[] = [];

  for (const p of points) {
    if (p.accuracy == null || p.accuracy > MAX_ACCURACY_M) continue;

    const last = kept[kept.length - 1];
    if (last) {
      const dtS = (p.ts - last.ts) / 1000;
      if (dtS <= 0) continue; // punto fuera de orden o duplicado exacto
      const impliedSpeed = haversineMeters(last, p) / dtS;
      if (impliedSpeed > MAX_PLAUSIBLE_SPEED_MS) continue;
    }

    kept.push(p);
  }

  return kept;
}

/** Rumbo inicial (radianes, 0 = norte) del punto a al b. */
export function bearingRad(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLon = toRad(b.lon - a.lon);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return Math.atan2(y, x);
}

/** Punto a `distM` metros de `from` siguiendo `bearing` (radianes). */
export function destPoint(
  from: { lat: number; lon: number },
  bearing: number,
  distM: number,
): { lat: number; lon: number } {
  const d = distM / EARTH_RADIUS_M;
  const lat1 = toRad(from.lat);
  const lon1 = toRad(from.lon);
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(bearing),
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
    );
  return { lat: (lat2 * 180) / Math.PI, lon: (lon2 * 180) / Math.PI };
}

/** Distancia total (m) recorrida por una secuencia YA filtrada de puntos. */
export function pathDistanceMeters(points: RawPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineMeters(points[i - 1], points[i]);
  }
  return total;
}

/**
 * Desnivel positivo acumulado (m) sobre una secuencia ya filtrada.
 * Aplica un umbral mínimo por tramo para no acumular el ruido del barómetro/GPS.
 */
export function elevationGainMeters(points: RawPoint[], thresholdM = 1): number {
  let gain = 0;
  let ref: number | null = null;

  for (const p of points) {
    if (p.altitude == null) continue;
    if (ref == null) {
      ref = p.altitude;
      continue;
    }
    const delta = p.altitude - ref;
    if (delta >= thresholdM) {
      gain += delta;
      ref = p.altitude;
    } else if (delta <= -thresholdM) {
      ref = p.altitude;
    }
  }

  return gain;
}
