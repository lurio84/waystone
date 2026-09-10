import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Una carrera. Los campos agregados (distanceM, movingTimeS, ...) son una
 * CACHÉ de lo que calcula `src/core` a partir de los puntos crudos: se
 * escriben al cerrar la carrera y se pueden recalcular en cualquier momento
 * sin haber perdido nada.
 */
export const runs = sqliteTable('runs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  startedAt: integer('started_at').notNull(),
  endedAt: integer('ended_at'),
  status: text('status', { enum: ['active', 'finished'] }).notNull(),
  distanceM: real('distance_m').notNull().default(0),
  movingTimeS: real('moving_time_s').notNull().default(0),
  elapsedTimeS: real('elapsed_time_s').notNull().default(0),
  avgPaceSPerKm: real('avg_pace_s_per_km').notNull().default(0),
  elevGainM: real('elev_gain_m').notNull().default(0),
  notes: text('notes'),
});

/** Punto crudo del GPS. La capa de captura SOLO hace INSERT aquí. */
export const points = sqliteTable('points', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  runId: integer('run_id').notNull(),
  ts: integer('ts').notNull(),
  lat: real('lat').notNull(),
  lon: real('lon').notNull(),
  altitude: real('altitude'),
  accuracy: real('accuracy'),
  speed: real('speed'),
});

/** SOLO pausas/reanudaciones que pulsó el usuario. La autopausa se deduce. */
export const runEvents = sqliteTable('run_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  runId: integer('run_id').notNull(),
  ts: integer('ts').notNull(),
  kind: text('kind', { enum: ['pause', 'resume'] }).notNull(),
});

/** Parciales por km. Caché derivada, se regenera al recalcular. */
export const splits = sqliteTable('splits', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  runId: integer('run_id').notNull(),
  kmIndex: integer('km_index').notNull(),
  distanceM: real('distance_m').notNull(),
  durationS: real('duration_s').notNull(),
  paceSPerKm: real('pace_s_per_km').notNull(),
  elevGainM: real('elev_gain_m').notNull(),
});

/**
 * Runa desbloqueada. APPEND-ONLY, como una pausa manual: se inserta una vez y
 * NUNCA se actualiza ni recalcula. `id` = id de la runa en `src/core/runes.ts`.
 * Tabla creada por la migración v3.
 */
export const achievements = sqliteTable('achievements', {
  id: text('id').primaryKey(),
  unlockedAt: integer('unlocked_at').notNull(),
  runId: integer('run_id').notNull(),
});

export type RunRow = typeof runs.$inferSelect;
export type PointRow = typeof points.$inferSelect;
export type RunEventRow = typeof runEvents.$inferSelect;
export type SplitRow = typeof splits.$inferSelect;
export type AchievementRow = typeof achievements.$inferSelect;
