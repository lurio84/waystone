import { buildGpx } from './gpx';
import { synthWalk } from './testutils';

describe('buildGpx', () => {
  const pts = synthWalk([{ seconds: 5, speedMs: 3, elevM: 2 }]);
  const gpx = buildGpx(pts, { name: 'Carrera de prueba', startedAt: pts[0].ts });

  it('es un GPX 1.1 bien formado con un track', () => {
    expect(gpx).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(gpx).toContain('<gpx version="1.1"');
    expect(gpx).toContain('<trkseg>');
    expect(gpx).toContain('</gpx>');
  });

  it('incluye un trkpt por punto con lat/lon/time', () => {
    const count = (gpx.match(/<trkpt /g) ?? []).length;
    expect(count).toBe(pts.length);
    expect(gpx).toContain(`lat="${pts[0].lat}"`);
    expect(gpx).toContain('<time>');
  });

  it('incluye elevación cuando el punto la tiene', () => {
    expect(gpx).toContain('<ele>');
  });

  it('escapa caracteres XML del nombre', () => {
    const g = buildGpx(pts, { name: 'A & B <test>', startedAt: pts[0].ts });
    expect(g).toContain('A &amp; B &lt;test&gt;');
    expect(g).not.toContain('<test>');
  });
});
