/**
 * Runas: los logros de la app. A diferencia de la XP y el nivel (que son una
 * interpretación y se recalculan), una runa desbloqueada es un HECHO — la capa
 * de datos la escribe una vez en `achievements` y no la vuelve a tocar.
 *
 * Por eso `unlockedAt` es el `startedAt` de la carrera que la ganó, nunca
 * "ahora": re-evaluar el historial entero tiene que dar exactamente el mismo
 * resultado, o la tabla append-only deja de serlo en espíritu.
 *
 * Catálogo pensado para crecer y retocarse.
 */
import { dayStreak } from './progress';
import type { RunSummary } from './types';

export interface RuneUnlock {
  id: string;
  /** id de la fila `runs` que desbloqueó la runa */
  runId: number;
  /** epoch ms — el `startedAt` de esa carrera */
  unlockedAt: number;
}

interface RuneDef {
  id: string;
  titulo: string;
  descripcion: string;
  /**
   * `runs` llega ordenada por `startedAt` ascendente. Devuelve la primera
   * carrera que cumple la condición de la runa, o null si aún no se ha ganado.
   */
  trigger: (runs: RunSummary[]) => RunSummary | null;
}

const HALF_MARATHON_M = 21_097.5;
const HUNDRED_KM_M = 100_000;

const firstWith = (runs: RunSummary[], pred: (r: RunSummary) => boolean): RunSummary | null =>
  runs.find(pred) ?? null;

const startHour = (r: RunSummary): number => new Date(r.startedAt).getHours();

export const RUNES: readonly RuneDef[] = [
  {
    id: 'primer-mojon',
    titulo: 'Primer mojón',
    descripcion: 'Termina tu primera carrera.',
    trigger: (runs) => runs[0] ?? null,
  },
  {
    id: 'cinco-k',
    titulo: 'Cinco',
    descripcion: 'Una carrera de 5 km o más.',
    trigger: (runs) => firstWith(runs, (r) => r.distanceM >= 5_000),
  },
  {
    id: 'diez-k',
    titulo: 'Diez',
    descripcion: 'Una carrera de 10 km o más.',
    trigger: (runs) => firstWith(runs, (r) => r.distanceM >= 10_000),
  },
  {
    id: 'media-maraton',
    titulo: 'Media',
    descripcion: 'Una carrera de media maratón (21,097 km).',
    trigger: (runs) => firstWith(runs, (r) => r.distanceM >= HALF_MARATHON_M),
  },
  {
    id: 'bajo-las-estrellas',
    titulo: 'Bajo las estrellas',
    descripcion: 'Empieza una carrera entre las 21:00 y las 5:00.',
    trigger: (runs) => firstWith(runs, (r) => startHour(r) >= 21 || startHour(r) < 5),
  },
  {
    id: 'antes-del-alba',
    titulo: 'Antes del alba',
    descripcion: 'Empieza una carrera entre las 5:00 y las 7:00.',
    trigger: (runs) => firstWith(runs, (r) => startHour(r) >= 5 && startHour(r) < 7),
  },
  {
    id: 'tres-seguidas',
    titulo: 'Tres piedras seguidas',
    descripcion: 'Corre tres días seguidos.',
    // O(n²): dayStreak reconstruye un Set por iteración. Trivial a la escala de
    // esta app (una persona, decenas de carreras); si algún día importa, se
    // precalcula el set de días una vez.
    trigger: (runs) => {
      for (let i = 0; i < runs.length; i++) {
        if (dayStreak(runs.slice(0, i + 1), runs[i].startedAt) >= 3) return runs[i];
      }
      return null;
    },
  },
  {
    id: 'centenario',
    titulo: 'Cien',
    descripcion: 'Acumula 100 km sumando todas tus carreras.',
    trigger: (runs) => {
      let acc = 0;
      for (const r of runs) {
        acc += r.distanceM;
        if (acc >= HUNDRED_KM_M) return r;
      }
      return null;
    },
  },
];

/**
 * Todas las runas ganadas a día de hoy, con la carrera y el momento exactos.
 * Idempotente. La capa de datos inserta solo las que no estén ya en
 * `achievements` (clave primaria por `id`).
 *
 * IMPORTANTE para esa capa: la inserción se decide SOLO por `id`, nunca se
 * actualiza `run_id` ni `unlocked_at` de una runa ya guardada. `distanceM`
 * viene de la caché de `runs`, que `recalcRun` puede reescribir — si tras una
 * corrección `evaluateRunes` atribuye "cinco-k" a otra carrera, gana la
 * primera atribución. Un logro es un hecho, no se re-litiga.
 */
export function evaluateRunes(runs: RunSummary[]): RuneUnlock[] {
  const ordered = [...runs].sort((a, b) => a.startedAt - b.startedAt);
  const unlocks: RuneUnlock[] = [];
  for (const rune of RUNES) {
    const run = rune.trigger(ordered);
    if (run) unlocks.push({ id: rune.id, runId: run.id, unlockedAt: run.startedAt });
  }
  return unlocks;
}
