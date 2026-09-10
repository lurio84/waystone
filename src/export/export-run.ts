import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { buildGpx } from '@/core/gpx';
import { formatDateTime } from '@/core/format';
import { getEvents, getPoints, getRun, getSplits } from '@/db/runs';

function slug(ts: number): string {
  return new Date(ts).toISOString().slice(0, 16).replace(/[:T]/g, '-');
}

/** Vuelca la carrera a un fichero y abre el diálogo de compartir de Android. */
async function writeAndShare(name: string, contents: string, mimeType: string): Promise<void> {
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(contents);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: 'Exportar carrera' });
  }
}

/** GPX estándar: importable en Strava, Garmin Connect, Komoot, etc. */
export async function exportRunGpx(runId: number): Promise<void> {
  const run = getRun(runId);
  if (!run) return;
  const points = getPoints(runId);
  const gpx = buildGpx(points, {
    name: `Carrera ${formatDateTime(run.startedAt)}`,
    startedAt: run.startedAt,
  });
  await writeAndShare(`waystone-${slug(run.startedAt)}.gpx`, gpx, 'application/gpx+xml');
}

/** Dump JSON completo, puntos crudos incluidos: por si quiero mis datos enteros. */
export async function exportRunJson(runId: number): Promise<void> {
  const run = getRun(runId);
  if (!run) return;
  const payload = {
    run,
    points: getPoints(runId),
    events: getEvents(runId),
    splits: getSplits(runId),
    exportedAt: Date.now(),
  };
  await writeAndShare(
    `waystone-${slug(run.startedAt)}.json`,
    JSON.stringify(payload, null, 2),
    'application/json',
  );
}
