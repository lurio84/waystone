import type { RawPoint } from './types';

const M_PER_DEG_LAT = 111_320;

export interface WalkSegment {
  /** duración del tramo en segundos */
  seconds: number;
  /** velocidad constante durante el tramo en m/s */
  speedMs: number;
  /** precisión reportada (m); por defecto 5 */
  accuracy?: number;
  /** si false, los puntos van sin speed y hay que derivarla */
  reportSpeed?: boolean;
  /** ganancia de altitud lineal en el tramo (m); por defecto 0 */
  elevM?: number;
}

/**
 * Genera una secuencia de puntos GPS sintéticos avanzando en línea recta
 * hacia el norte desde un origen, encadenando tramos de velocidad constante.
 * Muestreo de 1 punto/segundo.
 */
export function synthWalk(
  segments: WalkSegment[],
  opts: { startTs?: number; startLat?: number; startLon?: number } = {},
): RawPoint[] {
  const startTs = opts.startTs ?? 1_000_000_000_000;
  const lon = opts.startLon ?? -5.9845;
  let lat = opts.startLat ?? 37.3891;
  let alt = 100;
  let ts = startTs;

  const points: RawPoint[] = [
    { ts, lat, lon, altitude: alt, accuracy: 5, speed: 0 },
  ];

  for (const seg of segments) {
    const accuracy = seg.accuracy ?? 5;
    const reportSpeed = seg.reportSpeed ?? true;
    const elevStep = (seg.elevM ?? 0) / seg.seconds;

    for (let s = 0; s < seg.seconds; s++) {
      ts += 1000;
      lat += seg.speedMs / M_PER_DEG_LAT;
      alt += elevStep;
      points.push({
        ts,
        lat,
        lon,
        altitude: alt,
        accuracy,
        speed: reportSpeed ? seg.speedMs : null,
      });
    }
  }

  return points;
}
