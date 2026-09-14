/**
 * Capa de red del DEM. Fuera de `src/core` a propósito: `src/core` es puro y
 * no sabe de `fetch`. Nunca lanza — cualquier fallo (sin red, timeout,
 * servicio caído) devuelve `null` y la app cae al desnivel GPS con `≈`.
 *
 * Open-Meteo / Copernicus DEM GLO-90: gratis, sin API key, sin cuenta
 * (respeta "todo local, sin cuenta ni servidor" — se pide, no se vive ahí),
 * 10.000 llamadas/día de uso no comercial, lotes de hasta 100 coordenadas.
 * https://open-meteo.com/en/docs/elevation-api
 */
import { buildProfile, elevationGainFromProfile, sampleForDem, type ElevationProfile } from '@/core/elevation';
import type { RawPoint } from '@/core/types';

const ELEVATION_API_URL = 'https://api.open-meteo.com/v1/elevation';
const BATCH_SIZE = 100;
const TIMEOUT_MS = 8_000;

async function fetchElevationBatch(pts: RawPoint[]): Promise<number[] | null> {
  const lat = pts.map((p) => p.lat.toFixed(6)).join(',');
  const lon = pts.map((p) => p.lon.toFixed(6)).join(',');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${ELEVATION_API_URL}?latitude=${lat}&longitude=${lon}`, {
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { elevation?: number[] };
    if (!Array.isArray(json.elevation) || json.elevation.length !== pts.length) return null;
    return json.elevation;
  } catch {
    return null; // sin red, timeout, JSON roto — todo cae al mismo sitio
  } finally {
    clearTimeout(timeout);
  }
}

export interface DemResult {
  profile: ElevationProfile;
  elevGainDemM: number;
}

/**
 * Pide el perfil DEM para una carrera y lo construye. `points` son los
 * puntos crudos (o filtrados) de la carrera — el muestreo lo decide esta
 * función. Devuelve `null` si cualquier lote falla; no reintenta (el que
 * llama decide cuándo reintentar, p.ej. al reabrir el detalle).
 */
export async function fetchElevationProfile(points: RawPoint[]): Promise<DemResult | null> {
  const samples = sampleForDem(points);
  if (samples.length === 0) return null;

  const elevations: number[] = [];
  for (let i = 0; i < samples.length; i += BATCH_SIZE) {
    const batch = samples.slice(i, i + BATCH_SIZE);
    const batchElevs = await fetchElevationBatch(batch);
    if (!batchElevs) return null; // best-effort: un lote roto invalida toda la carrera
    elevations.push(...batchElevs);
  }

  const profile = buildProfile(samples, elevations);
  return { profile, elevGainDemM: elevationGainFromProfile(profile) };
}
