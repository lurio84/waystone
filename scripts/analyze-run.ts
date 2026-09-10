/**
 * Analiza el JSON que exporta la app (detalle de carrera → Exportar JSON) y
 * escupe el veredicto sobre el P0: ¿aguantó la grabación con la pantalla
 * apagada, o el sistema la estranguló / mató a media?
 *
 *   npm run analyze -- ruta/al/waystone-2026-09-10-21-30.json
 *
 * Reusa `src/core` a propósito: lo que calcula este script y lo que muestra
 * la app salen de las MISMAS funciones. Si el APK del móvil es anterior a los
 * fixes de métricas, la fila `runs` del export traerá los valores viejos
 * (inflados por el punto fantasma) y aquí se ve el contraste.
 *
 * Nota: desde `c8dce6a` el punto fantasma se filtra en captura, así que los
 * exports de APKs nuevos ya no lo traen (el bloque "fantasma" reportará 0).
 * El recorte por `startedAt` en `src/core` sigue ahí como defensa para
 * exports viejos.
 */
import { readFileSync } from 'node:fs';
import { haversineMeters } from '../src/core/geo';
import { formatDuration, formatPace } from '../src/core/format';
import {
  computeMetrics,
  computeSplits,
  DEFAULT_DATA_GAP_S,
  dataGapIntervals,
} from '../src/core/metrics';
import type { RawPoint, RunEvent } from '../src/core/types';

interface RunRow {
  id: number;
  startedAt: number;
  endedAt: number | null;
  status: string;
  distanceM: number;
  movingTimeS: number;
  elapsedTimeS: number;
  avgPaceSPerKm: number;
  elevGainM: number;
}

interface Export {
  run: RunRow;
  points: RawPoint[];
  events: RunEvent[];
  splits: unknown[];
  exportedAt: number;
}

const file = process.argv[2];
if (!file) {
  console.error('uso: npm run analyze -- <fichero.json>');
  process.exit(1);
}

const data = JSON.parse(readFileSync(file, 'utf8')) as Export;
const { run, points, events } = data;
const startedAt = run.startedAt;
const endedAt = run.endedAt;

const line = (s = '') => console.log(s);
const min = (ms: number) => (ms / 60_000).toFixed(1);

line('═══ ' + file);
line(`carrera #${run.id}  ·  status=${run.status}  ·  ended_at=${endedAt ?? 'NULL (rescatada Reanudar→Terminar)'}`);
line();

// ── Punto fantasma ────────────────────────────────────────────────────────
const pre = points.filter((p) => p.ts < startedAt);
const real = points.filter((p) => p.ts >= startedAt);
line('PUNTOS');
line(`  totales: ${points.length}   ·   con ts < startedAt (fantasma): ${pre.length}`);
for (const p of pre) {
  line(`    fantasma a ${((p.ts - startedAt) / 1000).toFixed(0)} s del inicio`);
}
line(`  usables: ${real.length}`);
line();

if (real.length < 2) {
  line('menos de 2 puntos usables — nada que medir.');
  process.exit(0);
}

// ── Huecos entre puntos (LA métrica del P0) ───────────────────────────────
const gaps: { fromMinuteMs: number; gapS: number }[] = [];
for (let i = 1; i < real.length; i++) {
  const gapMs = real[i].ts - real[i - 1].ts;
  gaps.push({ fromMinuteMs: real[i - 1].ts - startedAt, gapS: gapMs / 1000 });
}
gaps.sort((a, b) => b.gapS - a.gapS);
line('HUECOS ENTRE PUNTOS  (fantasma ya excluido)');
line(`  máximo: ${gaps[0].gapS.toFixed(0)} s  en el minuto ${min(gaps[0].fromMinuteMs)}`);
line('  top 5:');
for (const g of gaps.slice(0, 5)) {
  line(`    ${g.gapS.toFixed(0).padStart(5)} s  @ min ${min(g.fromMinuteMs)}`);
}
const lastPointAgeMs = endedAt != null ? endedAt - real[real.length - 1].ts : 0;
if (endedAt != null) {
  line(`  del último punto al "Terminar": ${min(lastPointAgeMs)} min`);
}
line();

// ── Elapsed: las tres lecturas lado a lado ────────────────────────────────
const lastTs = real[real.length - 1].ts;
const pointSpanS = (lastTs - real[0].ts) / 1000;
const clockRawS = endedAt != null ? (endedAt - startedAt) / 1000 : NaN;
const clockBoundedS = ((endedAt != null ? Math.min(endedAt, lastTs) : lastTs) - startedAt) / 1000;
line('ELAPSED  (tres lecturas)');
line(`  reloj acotado  min(endedAt,últPunto)-startedAt : ${formatDuration(clockBoundedS)}   ← la buena`);
line(`  reloj puro     endedAt-startedAt                : ${Number.isNaN(clockRawS) ? 'n/a' : formatDuration(clockRawS)}`);
line(`  span de puntos últPunto-primerPunto            : ${formatDuration(pointSpanS)}`);
line();

// ── Distancia + métricas: recálculo vs caché del export ───────────────────
const opts = { startedAt, endedAt: endedAt ?? undefined };
const m = computeMetrics(points, events, opts);
const s = computeSplits(points, events, 1000, opts);
// qué le descontó al "en movimiento" el umbral de hueco de datos
const dataGaps = dataGapIntervals(real, DEFAULT_DATA_GAP_S);
const dataGapMs = dataGaps.reduce((acc, iv) => acc + (iv.end - iv.start), 0);

line('MÉTRICAS  (recalculadas con el código de hoy)');
line(`  distancia     : ${(m.distanceM / 1000).toFixed(3)} km`);
line(`  en movimiento : ${formatDuration(m.movingTimeS)}`);
line(
  `  huecos >${DEFAULT_DATA_GAP_S}s : ${dataGaps.length}  ` +
    `·  ${min(dataGapMs)} min fuera del "en movimiento"`,
);
line(`  ritmo medio   : ${formatPace(m.avgPaceSPerKm)} /km`);
line(`  desnivel +    : ${m.elevGainM.toFixed(0)} m`);
line(`  parciales     : ${s.length}`);
line();
line('CACHÉ DEL EXPORT  (lo que calculó el APK del móvil)');
line(`  distancia     : ${(run.distanceM / 1000).toFixed(3)} km`);
line(`  en movimiento : ${formatDuration(run.movingTimeS)}`);
line(`  elapsed       : ${formatDuration(run.elapsedTimeS)}`);
line(`  ritmo medio   : ${formatPace(run.avgPaceSPerKm)} /km`);
const diverge =
  Math.abs(run.distanceM - m.distanceM) > 20 ||
  Math.abs(run.elapsedTimeS - clockBoundedS) > 30 ||
  // un hueco largo de GPS puede dejar distancia y elapsed casi intactos y
  // desviar solo el tiempo en movimiento (varios minutos): sin esta línea
  // el chivato diría "coinciden" justo en el caso del P0.
  Math.abs(run.movingTimeS - m.movingTimeS) > 30;
line();
line(diverge
  ? '⚠  caché y recálculo divergen → el APK del móvil es anterior a los fixes (esperado). Manda el recálculo.'
  : '✓  caché y recálculo coinciden.');
line();

// ── Veredicto P0 ─────────────────────────────────────────────────────────
// Ojo: este script solo ve los PUNTOS. Que los puntos paren no distingue
// "el proceso murió" (P0) de "te paraste / perdiste cobertura al final".
// Eso lo dice `adb shell ps -o ETIME` (edad < duración ⇒ hubo kill) y
// `dumpsys activity services` (¿sigue el FGS?). El veredicto de aquí es
// una pista, no la sentencia.
line('VEREDICTO P0  (pista — confirmar con ps ETIME + dumpsys services)');
const totalKmStraight = haversineMeters(real[0], real[real.length - 1]) / 1000;
if (run.status === 'active' || endedAt == null) {
  line('  status active / sin ended_at → se rescató por Reanudar→Terminar.');
  line('  El proceso murió a media. P0 CONFIRMADO.');
} else if (gaps[0].gapS > 120) {
  line(`  hueco de ${gaps[0].gapS.toFixed(0)} s en el min ${min(gaps[0].fromMinuteMs)}: el GPS se`);
  line('  cortó y volvió. Estrangulamiento del FGS. P0 PARCIAL.');
} else if (endedAt != null && lastPointAgeMs > 120_000 && pointSpanS < clockRawS * 0.9) {
  line(`  los puntos paran ${min(lastPointAgeMs)} min antes del "Terminar". SOSPECHOSO:`);
  line('  puede ser P0 (proceso muerto) o que te pararas / sin cobertura al final.');
  line('  Mirar ps ETIME: si la edad del proceso < duración de la carrera → P0.');
} else {
  line('  huecos < 2 min y puntos casi hasta el final: pinta que AGUANTÓ.');
  line('  Confirmar que la notificación siguió visible y el FGS vivo al volver.');
}
line(`  (referencia: ${totalKmStraight.toFixed(2)} km en línea recta inicio→fin)`);
