/**
 * Persistencia del perfil de elevación DEM. Se inserta una vez por carrera
 * (append-only, como `achievements`) — nunca se recalcula ni se sobreescribe
 * salvo que se borre y se vuelva a pedir explícitamente. `run_index` (ver
 * `schema.ts`) reconstruye los tramos de `ElevationProfile`.
 */
import { asc, eq } from 'drizzle-orm';
import type { ElevationProfile } from '@/core/elevation';
import { getDb } from './client';
import { elevationSamples, runs } from './schema';

/** Perfil ya persistido para una carrera, o `null` si aún no se pidió. */
export function getElevationProfile(runId: number): ElevationProfile | null {
  const rows = getDb()
    .select()
    .from(elevationSamples)
    .where(eq(elevationSamples.runId, runId))
    .orderBy(asc(elevationSamples.runIndex), asc(elevationSamples.ts))
    .all();
  if (rows.length === 0) return null;

  const profile: ElevationProfile = [];
  for (const row of rows) {
    if (!profile[row.runIndex]) profile[row.runIndex] = [];
    profile[row.runIndex].push({ ts: row.ts, elevation: row.elevation });
  }
  // los índices de tramo no vienen necesariamente contiguos si algún tramo
  // quedó vacío (no debería pasar, pero un `.filter` barato lo blinda)
  return profile.filter((run) => run && run.length > 0);
}

/**
 * Guarda el perfil y el desnivel DEM que resulta de él. Solo escribe si
 * `runId` sigue existiendo (la carrera pudo borrarse entre la descarga y la
 * respuesta) y solo si aún no hay perfil — no se pisa un perfil ya guardado.
 */
export function saveElevationProfile(runId: number, profile: ElevationProfile, elevGainDemM: number): void {
  const db = getDb();
  const run = db.select({ id: runs.id }).from(runs).where(eq(runs.id, runId)).get();
  if (!run) return;
  if (getElevationProfile(runId) != null) return;

  const rows = profile.flatMap((run_, runIndex) =>
    run_.map((s) => ({ runId, runIndex, ts: s.ts, elevation: s.elevation })),
  );
  if (rows.length > 0) {
    db.insert(elevationSamples).values(rows).run();
  }
  db.update(runs).set({ elevGainDemM }).where(eq(runs.id, runId)).run();
}
