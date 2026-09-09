import { and, desc, eq } from 'drizzle-orm';
import { computeMetrics, computeSplits } from '@/core/metrics';
import type { RawPoint, RunEvent } from '@/core/types';
import { getDb } from './client';
import { points, runEvents, runs, splits, type RunRow, type SplitRow } from './schema';

function pointRowToRaw(r: {
  ts: number;
  lat: number;
  lon: number;
  altitude: number | null;
  accuracy: number | null;
  speed: number | null;
}): RawPoint {
  return {
    ts: r.ts,
    lat: r.lat,
    lon: r.lon,
    altitude: r.altitude,
    accuracy: r.accuracy,
    speed: r.speed,
  };
}

/** La carrera en curso, si la hay. */
export function getActiveRun(): RunRow | undefined {
  return getDb().select().from(runs).where(eq(runs.status, 'active')).get();
}

/**
 * Devuelve el id de la carrera activa; si no hay ninguna, crea una.
 * Idempotente: si el proceso se reinició a media carrera, se recupera la misma.
 */
export function startRun(now = Date.now()): number {
  const active = getActiveRun();
  if (active) return active.id;
  const row = getDb()
    .insert(runs)
    .values({ startedAt: now, status: 'active' })
    .returning({ id: runs.id })
    .get();
  return row.id;
}

/**
 * Inserta puntos crudos. Es lo ÚNICO que hace la capa de captura.
 * En background Android entrega los puntos a ráfagas (tras un doze pueden
 * llegar cientos de golpe), así que se trocea para no pasarse del límite de
 * variables de SQLite (999 / 7 columnas ≈ 140 filas).
 */
const INSERT_CHUNK = 100;

export function insertPoints(runId: number, pts: RawPoint[]): void {
  if (pts.length === 0) return;
  const db = getDb();
  for (let i = 0; i < pts.length; i += INSERT_CHUNK) {
    const chunk = pts.slice(i, i + INSERT_CHUNK);
    db.insert(points)
      .values(chunk.map((p) => ({ runId, ...p })))
      .run();
  }
}

/** Registra una pausa/reanudación pulsada por el usuario. */
export function addManualEvent(runId: number, kind: 'pause' | 'resume', ts = Date.now()): void {
  getDb().insert(runEvents).values({ runId, kind, ts }).run();
}

export function getPoints(runId: number): RawPoint[] {
  return getDb()
    .select()
    .from(points)
    .where(eq(points.runId, runId))
    .orderBy(points.ts)
    .all()
    .map(pointRowToRaw);
}

/** Timestamp del último punto de una carrera, o null si no tiene ninguno. */
export function getLastPointTs(runId: number): number | null {
  const row = getDb()
    .select({ ts: points.ts })
    .from(points)
    .where(eq(points.runId, runId))
    .orderBy(desc(points.ts))
    .limit(1)
    .get();
  return row?.ts ?? null;
}

export function getEvents(runId: number): RunEvent[] {
  return getDb()
    .select({ ts: runEvents.ts, kind: runEvents.kind })
    .from(runEvents)
    .where(eq(runEvents.runId, runId))
    .orderBy(runEvents.ts)
    .all();
}

export function getSplits(runId: number): SplitRow[] {
  return getDb()
    .select()
    .from(splits)
    .where(eq(splits.runId, runId))
    .orderBy(splits.kmIndex)
    .all();
}

export function getRun(runId: number): RunRow | undefined {
  return getDb().select().from(runs).where(eq(runs.id, runId)).get();
}

export function listRuns(limit = 50): RunRow[] {
  return getDb()
    .select()
    .from(runs)
    .where(eq(runs.status, 'finished'))
    .orderBy(desc(runs.startedAt))
    .limit(limit)
    .all();
}

/**
 * Recalcula métricas y parciales desde los puntos crudos y refresca la caché
 * (fila de `runs` + filas de `splits`). Seguro de llamar en cualquier momento.
 */
export function recalcRun(runId: number): void {
  const db = getDb();
  const pts = getPoints(runId);
  const evts = getEvents(runId);

  const m = computeMetrics(pts, evts);
  const s = computeSplits(pts, evts);

  db.update(runs)
    .set({
      distanceM: m.distanceM,
      movingTimeS: m.movingTimeS,
      elapsedTimeS: m.elapsedTimeS,
      avgPaceSPerKm: m.avgPaceSPerKm,
      elevGainM: m.elevGainM,
    })
    .where(eq(runs.id, runId))
    .run();

  db.delete(splits).where(eq(splits.runId, runId)).run();
  if (s.length > 0) {
    db.insert(splits)
      .values(s.map((x) => ({ runId, ...x })))
      .run();
  }
}

/** Cierra la carrera: marca fin, estado finished y cachea métricas. */
export function finishRun(runId: number, now = Date.now()): void {
  getDb()
    .update(runs)
    .set({ status: 'finished', endedAt: now })
    .where(eq(runs.id, runId))
    .run();
  recalcRun(runId);
}

/** Borra una carrera y todo lo suyo. */
export function deleteRun(runId: number): void {
  const db = getDb();
  db.delete(points).where(eq(points.runId, runId)).run();
  db.delete(runEvents).where(eq(runEvents.runId, runId)).run();
  db.delete(splits).where(eq(splits.runId, runId)).run();
  db.delete(runs).where(eq(runs.id, runId)).run();
}

/**
 * Descarta una carrera activa que lleva un rato sin recibir NI UN punto
 * (start accidental, o el permiso de ubicación denegado). El margen de tiempo
 * es crítico: una carrera recién creada tiene 0 puntos durante los primeros
 * segundos hasta que el GPS entrega el primer fix — borrarla ahí mata la
 * carrera nada más empezar.
 */
const EMPTY_RUN_GRACE_MS = 90_000;

export function discardEmptyActiveRun(): void {
  const active = getActiveRun();
  if (!active) return;
  if (Date.now() - active.startedAt < EMPTY_RUN_GRACE_MS) return;
  const n = getDb().select().from(points).where(eq(points.runId, active.id)).all().length;
  if (n === 0) deleteRun(active.id);
}

export { and, eq };
