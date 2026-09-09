import { finishRun, getActiveRun, insertPoints, startRun } from '@/db/runs';
import { generateRunPoints } from './gen';
import { routeLengthMeters, type RouteScenario } from './routes';

/**
 * Motor del simulador: genera la secuencia con `generateRunPoints` y la va
 * insertando en la BD por el mismo camino que la tarea de background real
 * (`insertPoints`), para ejercer toda la cadena aguas abajo (métricas,
 * autopausa, parciales, mapa, historial, export) sin salir a correr.
 * NO toca expo-location.
 */

export interface SimHandle {
  runId: number;
  startedAt: number;
  stop: () => void;
}

export interface SimOptions {
  /** x30: un punto cada ~33 ms. Si no, tiempo real (uno por segundo). */
  accelerated?: boolean;
  onTick?: (emitted: number, total: number) => void;
  onDone?: (runId: number) => void;
}

export function startSimulation(route: RouteScenario, opts: SimOptions = {}): SimHandle | null {
  if (getActiveRun()) return null;

  const startTs = Date.now();
  const runId = startRun(startTs);
  const all = generateRunPoints(route, startTs);
  let i = 0;

  const flush = () => {
    if (i < all.length) {
      insertPoints(runId, [all[i]]);
      i += 1;
    }
    opts.onTick?.(i, all.length);
    if (i >= all.length) {
      clearInterval(timer);
      finishRun(runId, all[all.length - 1]?.ts ?? startTs);
      opts.onDone?.(runId);
    }
  };

  const timer = setInterval(flush, opts.accelerated ? 33 : 1000);
  flush();

  return {
    runId,
    startedAt: startTs,
    stop: () => {
      clearInterval(timer);
      if (getActiveRun()?.id === runId) finishRun(runId);
    },
  };
}

export { routeLengthMeters, generateRunPoints };
