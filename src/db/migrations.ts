import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Migración del esquema. `SCHEMA_SQL` en `client.ts` es el bootstrap v1 (crea
 * las tablas de una BD nueva); todo cambio posterior de esquema es un paso aquí.
 *
 * Un paso:
 *  - `version`: entero estrictamente creciente. El primero es el 2 (el 1 es el
 *    bootstrap, no vive en esta lista).
 *  - `up(db)`: SQL idempotente donde se pueda. Se ejecuta dentro de una
 *    transacción junto con el `PRAGMA user_version` (ver `runMigrations`), así
 *    que un paso a medias sobre una app matada se revierte entero.
 */
export type Migration = {
  version: number;
  label: string;
  up: (db: SQLiteDatabase) => void;
};

export const MIGRATIONS: Migration[] = [
  {
    version: 2,
    label: 'dedupe de puntos + índice único (run_id, ts)',
    up: (db) => {
      // Orden: deduplicar ANTES de crear el índice único, o el CREATE peta en
      // cualquier dispositivo que ya tenga ráfagas reentregadas por Android.
      db.execSync(`
        DELETE FROM points
        WHERE id NOT IN (SELECT MIN(id) FROM points GROUP BY run_id, ts);

        CREATE UNIQUE INDEX IF NOT EXISTS idx_points_run_ts_unique
          ON points (run_id, ts);

        DROP INDEX IF EXISTS idx_points_run_ts;
      `);
    },
  },
  {
    version: 3,
    label: 'tabla achievements (append-only)',
    up: (db) => {
      // Un logro desbloqueado es un hecho, como una pausa manual: se inserta
      // una vez y no se recalcula nunca. El binding Drizzle y las queries
      // llegan en la fase de progresión, cuando algo la use.
      db.execSync(`
        CREATE TABLE IF NOT EXISTS achievements (
          id TEXT PRIMARY KEY,
          unlocked_at INTEGER NOT NULL,
          run_id INTEGER NOT NULL
        );
      `);
    },
  },
];

/**
 * Pasos a aplicar sobre una BD que está en `current`. Función pura: es la
 * pieza que se testea en Node (no importa nada nativo).
 *
 * `0` y `1` son la misma versión: una BD creada antes de que se estampara
 * `user_version` devuelve `0` y no está desactualizada respecto al bootstrap.
 */
export function pendingMigrations(current: number, all: Migration[] = MIGRATIONS): Migration[] {
  const base = Math.max(current, 1);
  return all.filter((m) => m.version > base).sort((a, b) => a.version - b.version);
}

/**
 * Lee `user_version`, aplica cada paso pendiente en su propia transacción y
 * avanza `user_version` dentro de la misma. Idempotente: si no hay pasos
 * pendientes no hace nada.
 */
export function runMigrations(db: SQLiteDatabase): void {
  const row = db.getFirstSync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;

  for (const m of pendingMigrations(current)) {
    db.withTransactionSync(() => {
      m.up(db);
      db.execSync(`PRAGMA user_version = ${m.version};`);
    });
  }
}
