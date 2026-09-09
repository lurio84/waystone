import { autoPauseIntervals } from '@/core/autopause';
import { computeMetrics, computeSplits } from '@/core/metrics';
import { generateRunPoints } from './gen';
import { ROUTES, routeLengthMeters } from './routes';

const byId = (id: string) => ROUTES.find((r) => r.id === id)!;

describe('generateRunPoints — geometría', () => {
  it('cada ruta produce puntos que cubren ~su longitud declarada', () => {
    for (const route of ROUTES) {
      const pts = generateRunPoints(route, 1_000_000_000_000);
      const m = computeMetrics(pts, []);
      const real = routeLengthMeters(route);
      // ±6 % (deriva + el hueco del túnel no suma distancia)
      expect(m.distanceM).toBeGreaterThan(real * 0.90);
      expect(m.distanceM).toBeLessThan(real * 1.06);
    }
  });

  it('los puntos van a 1 Hz salvo en el hueco de túnel', () => {
    const pts = generateRunPoints(byId('river-run'), 0);
    const gaps = pts.slice(1).map((p, i) => (p.ts - pts[i].ts) / 1000);
    const big = gaps.filter((g) => g > 1);
    expect(big).toHaveLength(1); // exactamente el túnel
    expect(big[0]).toBeGreaterThanOrEqual(20);
  });
});

describe('park-loop — el semáforo', () => {
  const route = byId('park-loop');
  const pts = generateRunPoints(route, 1_000_000_000_000);
  const metrics = computeMetrics(pts, []);

  it('la autopausa detecta la parada de 40 s', () => {
    const ivs = autoPauseIntervals(pts);
    expect(ivs).toHaveLength(1);
    const durS = (ivs[0].end - ivs[0].start) / 1000;
    expect(durS).toBeGreaterThan(30);
    expect(durS).toBeLessThan(50);
  });

  it('el tiempo en movimiento excluye la parada', () => {
    expect(metrics.elapsedTimeS - metrics.movingTimeS).toBeGreaterThan(25);
  });

  it('el ritmo medio es coherente con el ritmo objetivo (5:30 /km)', () => {
    // objetivo 330 s/km; margen por deriva
    expect(metrics.avgPaceSPerKm).toBeGreaterThan(315);
    expect(metrics.avgPaceSPerKm).toBeLessThan(360);
  });
});

describe('splits', () => {
  it('river-run: los parciales suman ~la distancia total', () => {
    const route = byId('river-run');
    const pts = generateRunPoints(route, 0);
    const splits = computeSplits(pts, []);
    const total = computeMetrics(pts, []).distanceM;
    const sum = splits.reduce((a, s) => a + s.distanceM, 0);
    expect(Math.abs(sum - total)).toBeLessThan(60);
  });

  it('river-run: cada km completo dura ~5 min (300 s/km objetivo)', () => {
    const pts = generateRunPoints(byId('river-run'), 0);
    const full = computeSplits(pts, []).filter((s) => s.distanceM >= 1000);
    expect(full.length).toBeGreaterThanOrEqual(4);
    for (const s of full) {
      expect(s.paceSPerKm).toBeGreaterThan(280);
      expect(s.paceSPerKm).toBeLessThan(340);
    }
  });
});
