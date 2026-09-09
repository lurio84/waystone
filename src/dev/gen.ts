import { bearingRad, destPoint, haversineMeters } from '@/core/geo';
import type { RawPoint } from '@/core/types';
import { type RouteScenario } from './routes';

/**
 * Generador PURO de la secuencia de puntos GPS de una simulación. Convierte
 * una ruta (polilínea + ritmo + eventos) en la lista completa de `RawPoint`,
 * con parada de semáforo, hueco de túnel, pico de imprecisión y deriva de GPS.
 * Determinista: misma ruta → mismos puntos. Sin dependencias de RN/Expo/BD.
 */

const M_PER_DEG_LAT = 111_320;

function cumulative(route: RouteScenario): { cum: number[]; total: number } {
  const cum = [0];
  for (let i = 1; i < route.waypoints.length; i++) {
    cum.push(cum[i - 1] + haversineMeters(route.waypoints[i - 1], route.waypoints[i]));
  }
  return { cum, total: cum[cum.length - 1] };
}

function posAtDistance(
  route: RouteScenario,
  cum: number[],
  total: number,
  d: number,
): { lat: number; lon: number } {
  const clamped = Math.max(0, Math.min(d, total));
  let seg = 1;
  while (seg < cum.length - 1 && cum[seg] < clamped) seg++;
  const a = route.waypoints[seg - 1];
  const b = route.waypoints[seg];
  return destPoint(a, bearingRad(a, b), clamped - cum[seg - 1]);
}

/** `startTs` es el epoch (ms) del primer punto. */
export function generateRunPoints(route: RouteScenario, startTs = 0): RawPoint[] {
  const { cum, total } = cumulative(route);
  const speedMs = 1000 / route.paceSPerKm;

  const points: RawPoint[] = [];
  let simSec = 0;
  let cumDist = 0;
  let stoppedUntil = -1;
  let gapUntil = -1;
  let spikeUntil = -1;
  let spikeM = 0;
  const fired = new Set<number>();
  const MAX_SEC = 3 * 3600;

  while (cumDist < total && simSec < MAX_SEC) {
    route.events.forEach((ev, idx) => {
      if (fired.has(idx) || cumDist < ev.atM) return;
      fired.add(idx);
      if (ev.kind === 'stop') stoppedUntil = simSec + ev.seconds;
      else if (ev.kind === 'gap') gapUntil = simSec + ev.seconds;
      else {
        spikeUntil = simSec + ev.seconds;
        spikeM = ev.accuracyM;
      }
    });

    const stopped = simSec < stoppedUntil;
    const inGap = simSec < gapUntil;
    if (!stopped) cumDist += speedMs;

    if (!inGap) {
      const pos = posAtDistance(route, cum, total, cumDist);
      // deriva de GPS CORRELACIONADA: dos sinusoides lentas (periodos ~80-130 s)
      // más una pizca de ruido rápido. El error blanco por muestra no es
      // realista y además infla la distancia medida al sumar tramo a tramo.
      const wander =
        Math.sin(simSec * 0.05) * 0.7 + Math.cos(simSec * 0.077) * 0.3;
      const fast = Math.sin(simSec * 1.9) * 0.12;
      const jLat = ((wander + fast) * route.jitterM) / M_PER_DEG_LAT;
      const jLon =
        ((Math.cos(simSec * 0.041) * 0.8 + fast) * route.jitterM) /
        (M_PER_DEG_LAT * Math.cos((pos.lat * Math.PI) / 180));
      points.push({
        ts: startTs + simSec * 1000,
        lat: pos.lat + jLat,
        lon: pos.lon + jLon,
        altitude: 12,
        accuracy: simSec < spikeUntil ? spikeM : 3 + (simSec % 3),
        speed: stopped ? 0 : speedMs,
      });
    }
    simSec += 1;
  }
  return points;
}
