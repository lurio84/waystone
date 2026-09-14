/**
 * Orquesta la corrección DEM de una carrera: pide el perfil (red), lo
 * persiste y refresca la caché de `runs`/`splits`. Vive fuera de `src/db` y
 * `src/core` porque toca las dos capas a la vez.
 *
 * Best-effort e idempotente: nunca lanza, y si ya hay perfil persistido no
 * vuelve a pedir red. Se llama desde `stopRecording` (sin esperar) y desde
 * el detalle de carrera al montar (reintento si la primera vez no había red).
 */
import { getElevationProfile, saveElevationProfile } from '@/db/elevation';
import { getPoints, recalcRun } from '@/db/runs';
import { fetchElevationProfile } from './dem';

export async function syncElevationProfile(runId: number): Promise<void> {
  try {
    if (getElevationProfile(runId) != null) return;
    const points = getPoints(runId);
    if (points.length === 0) return;

    const result = await fetchElevationProfile(points);
    if (!result) return; // sin red / timeout / servicio caído: se reintenta luego

    saveElevationProfile(runId, result.profile, result.elevGainDemM);
    recalcRun(runId);
  } catch {
    // nunca debe tirar abajo la pantalla que lo llama
  }
}
