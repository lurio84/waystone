import type { RawPoint } from './types';

export interface GpxMeta {
  name: string;
  /** epoch ms del inicio */
  startedAt: number;
}

const escapeXml = (s: string): string =>
  s.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      case "'":
        return '&apos;';
      default:
        return '&quot;';
    }
  });

/**
 * Genera un GPX 1.1 estándar con un único track. Formato abierto: se importa
 * en Strava, Garmin Connect, Komoot, cualquier visor. Puro y testeable.
 */
export function buildGpx(points: RawPoint[], meta: GpxMeta): string {
  const trkpts = points
    .map((p) => {
      const parts = [
        `        <trkpt lat="${p.lat}" lon="${p.lon}">`,
        p.altitude != null ? `          <ele>${p.altitude}</ele>` : null,
        `          <time>${new Date(p.ts).toISOString()}</time>`,
        `        </trkpt>`,
      ].filter(Boolean);
      return parts.join('\n');
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Waystone" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${escapeXml(meta.name)}</name>
    <time>${new Date(meta.startedAt).toISOString()}</time>
  </metadata>
  <trk>
    <name>${escapeXml(meta.name)}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>
`;
}
