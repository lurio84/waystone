/**
 * Persistencia de las runas. La lógica de QUÉ se desbloea vive en
 * `src/core/runes.ts` (pura); esto solo la escribe.
 *
 * Append-only: una runa se inserta una vez y no se toca nunca más. Aunque
 * `recalcRun` cambie después la caché de `runs` que la disparó, la fila se
 * queda como está — no hay ningún camino de UPDATE en este fichero, y eso
 * es la garantía (no se puede testear con jest por expo-sqlite).
 */
import { evaluateRunes, type RuneUnlock } from '@/core/runes';
import type { RunSummary } from '@/core/types';
import { getDb } from './client';
import { achievements, type RunRow } from './schema';

function toSummary(r: RunRow): RunSummary {
  return {
    id: r.id,
    startedAt: r.startedAt,
    distanceM: r.distanceM,
    movingTimeS: r.movingTimeS,
    elevGainM: r.elevGainM,
  };
}

/** Runas ya desbloqueadas, tal cual están en la BD. */
export function getUnlockedAchievements(): RuneUnlock[] {
  return getDb()
    .select()
    .from(achievements)
    .all()
    .map((a) => ({ id: a.id, unlockedAt: a.unlockedAt, runId: a.runId }));
}

/**
 * Evalúa las runas contra el historial de carreras terminadas y PERSISTE las
 * que aún no estaban. Devuelve solo las nuevas de esta llamada (para que la
 * UI las anuncie); si no hay ninguna, devuelve `[]`.
 *
 * El `onConflictDoNothing` sobre la PK `id` cubre la carrera entre el arranque
 * de la app y la tarea headless: si las dos sincronizan a la vez, la segunda
 * no pisa a la primera.
 */
export function syncAchievements(finishedRuns: RunRow[]): RuneUnlock[] {
  const earned = evaluateRunes(finishedRuns.map(toSummary));
  if (earned.length === 0) return [];

  const db = getDb();
  const known = new Set(db.select({ id: achievements.id }).from(achievements).all().map((r) => r.id));
  const fresh = earned.filter((u) => !known.has(u.id));
  if (fresh.length === 0) return [];

  db.insert(achievements)
    .values(fresh.map((u) => ({ id: u.id, unlockedAt: u.unlockedAt, runId: u.runId })))
    .onConflictDoNothing()
    .run();

  return fresh;
}
