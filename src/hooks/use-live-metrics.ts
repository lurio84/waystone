import { useEffect, useState } from 'react';
import { filterPoints } from '@/core/geo';
import { currentPaceSPerKm, isAutoPausedNow } from '@/core/live';
import { computeMetrics } from '@/core/metrics';
import type { RawPoint } from '@/core/types';
import { getEvents, getPoints } from '@/db/runs';

export interface LiveMetrics {
  distanceM: number;
  movingTimeS: number;
  elapsedTimeS: number;
  avgPaceSPerKm: number;
  currentPaceSPerKm: number;
  autoPaused: boolean;
  /** puntos filtrados, para dibujar la ruta en el mini-mapa */
  points: RawPoint[];
}

const EMPTY: LiveMetrics = {
  distanceM: 0,
  movingTimeS: 0,
  elapsedTimeS: 0,
  avgPaceSPerKm: 0,
  currentPaceSPerKm: 0,
  autoPaused: false,
  points: [],
};

/**
 * Recalcula las métricas en vivo releyendo los puntos crudos de SQLite cada
 * pocos segundos. Usa exactamente las mismas funciones de `src/core` que el
 * recálculo posterior de la carrera, así que lo que ves corriendo y lo que
 * ves luego en el historial coinciden.
 *
 * PUNTO DE ESCALADO CONOCIDO: relee y refiltra TODOS los puntos en cada tick.
 * A 1 Hz una carrera de 90 min son ~5400 puntos; hacia el final del rodaje
 * largo esto calienta. Si molesta: cachear métricas incrementalmente en vez
 * de recalcular desde cero. No tocar hasta medirlo en el móvil.
 */
export function useLiveMetrics(
  runId: number | null,
  startedAt: number | null,
  intervalMs = 2000,
): LiveMetrics {
  const [metrics, setMetrics] = useState<LiveMetrics>(EMPTY);

  useEffect(() => {
    if (runId == null) return;
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      const points = getPoints(runId);
      const events = getEvents(runId);
      // startedAt (sin endedAt, la carrera está viva): descarta el punto
      // fantasma del arranque para que "En movimiento" y "Ritmo medio" no
      // salgan inflados. El cronómetro "Tiempo" ya es reloj de pared aparte.
      const base = computeMetrics(points, events, startedAt != null ? { startedAt } : {});
      setMetrics({
        ...base,
        currentPaceSPerKm: currentPaceSPerKm(points),
        autoPaused: isAutoPausedNow(points),
        points: filterPoints(points),
      });
    };

    const prime = setTimeout(tick, 0);
    const id = setInterval(tick, intervalMs);
    return () => {
      cancelled = true;
      clearTimeout(prime);
      clearInterval(id);
    };
  }, [runId, startedAt, intervalMs]);

  return metrics;
}
