/**
 * Genera `killed-run.json` con la forma exacta de una carrera problemática,
 * para verificar `analyze-run.ts` sin depender de una salida real ni de
 * `src/dev` (que arrastra expo-sqlite). Ejecutar: `npx tsx scripts/fixtures/make-fixture.ts`
 *
 * Escenario: 17 min grabando bien, el FGS se estrangula 900 s, vuelve 3 min
 * y muere. El usuario pulsa "Terminar" al llegar a casa (min 75). Además el
 * primer punto es el fantasma de expo-location, a −483 s del inicio.
 *
 * La fila `run` guarda lo que habría calculado el APK ANTES de los fixes
 * (computeMetrics sin startedAt/endedAt), para que el contraste caché vs
 * recálculo del script tenga algo que enseñar.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { computeMetrics } from '../../src/core/metrics';
import type { RawPoint } from '../../src/core/types';

const M_PER_DEG_LAT = 111_320;
const START_LAT = 37.3891;
const LON = -5.9845;
const startedAt = 1_700_000_000_000;

function leg(fromTs: number, seconds: number, fromLat: number, speedMs: number): RawPoint[] {
  const out: RawPoint[] = [];
  let lat = fromLat;
  for (let s = 1; s <= seconds; s++) {
    lat += speedMs / M_PER_DEG_LAT;
    out.push({
      ts: fromTs + s * 1000,
      lat,
      lon: LON,
      altitude: 100,
      accuracy: 5,
      speed: speedMs,
    });
  }
  return out;
}

// punto fantasma: última ubicación conocida, a ~120 m y con ts viejo
const phantom: RawPoint = {
  ts: startedAt - 483_000,
  lat: START_LAT - 120 / M_PER_DEG_LAT,
  lon: LON,
  altitude: 100,
  accuracy: 8,
  speed: 0,
};

const leg1 = leg(startedAt, 17 * 60, START_LAT, 3); // min 0 → 17
const gapEndTs = leg1[leg1.length - 1].ts + 900_000; // +900 s de silencio
const leg2 = leg(gapEndTs, 3 * 60, leg1[leg1.length - 1].lat, 3); // recuperación 3 min
const endedAt = startedAt + 75 * 60_000; // "Terminar" al llegar a casa

/** Fila `run` con lo que el APK viejo habría cacheado (sin recorte ni clamp). */
function runRow(points: RawPoint[], ended: number | null, status: string) {
  const old = computeMetrics(points, []);
  return {
    id: 1,
    startedAt,
    endedAt: ended,
    status,
    distanceM: old.distanceM,
    movingTimeS: old.movingTimeS,
    elapsedTimeS: old.elapsedTimeS,
    avgPaceSPerKm: old.avgPaceSPerKm,
    elevGainM: old.elevGainM,
    notes: null,
  };
}

function write(name: string, points: RawPoint[], ended: number | null, status: string) {
  const payload = {
    run: runRow(points, ended, status),
    points,
    events: [],
    splits: [],
    exportedAt: endedAt + 60_000,
  };
  const dest = join(__dirname, name);
  writeFileSync(dest, JSON.stringify(payload, null, 2));
  console.log(`escrito ${dest}  ·  ${points.length} puntos`);
}

// Caso A: el FGS se estranguló 900 s, volvió y luego murió; Terminar en casa.
// Verifica la detección de huecos y el clamp del elapsed (35 min, no 75).
write('killed-run.json', [phantom, ...leg1, ...leg2], endedAt, 'finished');

// Caso B: murió a min 17 y no volvió; se pulsa Terminar al llegar a casa
// (min 75). El clamp deja elapsed en ~17 min, no en 75. Sin hueco medible
// entre puntos: el corte se ve en "último punto → Terminar = 58 min".
write('killed-run-dead.json', [phantom, ...leg1], endedAt, 'finished');
