import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import type { RawPoint } from '@/core/types';
import { initSchema } from '@/db/client';
import { getActiveRun, insertPoints } from '@/db/runs';

export const LOCATION_TASK = 'zancada-location-updates';

/**
 * Tarea de background. Se ejecuta en un contexto frágil (la app puede estar
 * en segundo plano o incluso matada por el sistema). Por eso hace UNA sola
 * cosa: convertir las lecturas del GPS en puntos crudos e insertarlas. Nada
 * de calcular distancia, ritmo ni autopausa aquí — si eso peta, se pierde la
 * carrera. Los derivados se calculan al leer, en `src/core`.
 */
TaskManager.defineTask<{ locations?: Location.LocationObject[] }>(
  LOCATION_TASK,
  async ({ data, error }) => {
    if (error || !data?.locations?.length) return;

    // El sistema puede revivir esta tarea en un contexto JS nuevo donde la app
    // nunca arrancó. initSchema es idempotente (CREATE TABLE IF NOT EXISTS).
    initSchema();

    const active = getActiveRun();
    if (!active) return;

    const pts: RawPoint[] = data.locations.map((l) => ({
      ts: Math.round(l.timestamp),
      lat: l.coords.latitude,
      lon: l.coords.longitude,
      altitude: l.coords.altitude ?? null,
      accuracy: l.coords.accuracy ?? null,
      speed: l.coords.speed ?? null,
    }));

    insertPoints(active.id, pts);
  },
);
