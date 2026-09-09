import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';
import * as schema from './schema';

// NO renombrar este fichero aunque cambie el nombre del proyecto: cambiarlo
// huérfana la BD que ya existe en el móvil (carreras perdidas). Es interno.
const DB_NAME = 'zancada.db';

/** Versión del esquema. Subir al añadir una migración en `SCHEMA_SQL`. */
const SCHEMA_VERSION = 1;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  status TEXT NOT NULL,
  distance_m REAL NOT NULL DEFAULT 0,
  moving_time_s REAL NOT NULL DEFAULT 0,
  elapsed_time_s REAL NOT NULL DEFAULT 0,
  avg_pace_s_per_km REAL NOT NULL DEFAULT 0,
  elev_gain_m REAL NOT NULL DEFAULT 0,
  notes TEXT
);
CREATE TABLE IF NOT EXISTS points (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  ts INTEGER NOT NULL,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  altitude REAL,
  accuracy REAL,
  speed REAL
);
CREATE INDEX IF NOT EXISTS idx_points_run_ts ON points (run_id, ts);
CREATE TABLE IF NOT EXISTS run_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  ts INTEGER NOT NULL,
  kind TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_run_events_run ON run_events (run_id);
CREATE TABLE IF NOT EXISTS splits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  km_index INTEGER NOT NULL,
  distance_m REAL NOT NULL,
  duration_s REAL NOT NULL,
  pace_s_per_km REAL NOT NULL,
  elev_gain_m REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_splits_run ON splits (run_id);
`;

let _sqlite: SQLiteDatabase | null = null;
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

function sqlite(): SQLiteDatabase {
  if (!_sqlite) {
    _sqlite = openDatabaseSync(DB_NAME);
    _sqlite.execSync('PRAGMA journal_mode = WAL;');
    _sqlite.execSync('PRAGMA foreign_keys = ON;');
  }
  return _sqlite;
}

/** Instancia de Drizzle tipada con el esquema. Perezosa: abre la BD al primer uso. */
export function getDb(): ReturnType<typeof drizzle<typeof schema>> {
  if (!_db) _db = drizzle(sqlite(), { schema });
  return _db;
}

/** Crea las tablas si no existen. Idempotente; llamar una vez al arrancar. */
export function initSchema(): void {
  const db = sqlite();
  db.execSync(SCHEMA_SQL);
  db.execSync(`PRAGMA user_version = ${SCHEMA_VERSION};`);
}

export { schema };
