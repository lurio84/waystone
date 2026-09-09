import {
  elevationGainMeters,
  filterPoints,
  haversineMeters,
  MAX_ACCURACY_M,
  pathDistanceMeters,
} from './geo';
import { synthWalk } from './testutils';
import type { RawPoint } from './types';

describe('haversineMeters', () => {
  it('devuelve 0 para el mismo punto', () => {
    expect(haversineMeters({ lat: 37.4, lon: -5.9 }, { lat: 37.4, lon: -5.9 })).toBe(0);
  });

  it('mide ~111.32 km por grado de latitud', () => {
    const d = haversineMeters({ lat: 0, lon: 0 }, { lat: 1, lon: 0 });
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });

  it('coincide con una distancia conocida (Sevilla → Madrid ~390 km)', () => {
    const d = haversineMeters({ lat: 37.3891, lon: -5.9845 }, { lat: 40.4168, lon: -3.7038 });
    expect(d / 1000).toBeGreaterThan(385);
    expect(d / 1000).toBeLessThan(395);
  });
});

describe('filterPoints', () => {
  it('descarta puntos sin precisión o con precisión peor que el umbral', () => {
    const base = synthWalk([{ seconds: 3, speedMs: 3 }]);
    const dirty: RawPoint[] = [
      ...base,
      { ...base[base.length - 1], ts: base[base.length - 1].ts + 1000, accuracy: MAX_ACCURACY_M + 10 },
      { ...base[base.length - 1], ts: base[base.length - 1].ts + 2000, accuracy: null },
    ];
    const kept = filterPoints(dirty);
    expect(kept).toHaveLength(base.length);
    expect(kept.every((p) => p.accuracy != null && p.accuracy <= MAX_ACCURACY_M)).toBe(true);
  });

  it('descarta un salto de GPS con velocidad imposible', () => {
    const pts = synthWalk([{ seconds: 5, speedMs: 3 }]);
    const jump: RawPoint = {
      ...pts[pts.length - 1],
      ts: pts[pts.length - 1].ts + 1000,
      lat: pts[pts.length - 1].lat + 0.01, // ~1.1 km en 1 s
    };
    const kept = filterPoints([...pts, jump]);
    expect(kept).not.toContain(jump);
  });

  it('deja intactos los puntos limpios de una carrera normal', () => {
    const pts = synthWalk([{ seconds: 60, speedMs: 3 }]);
    expect(filterPoints(pts)).toHaveLength(pts.length);
  });
});

describe('pathDistanceMeters', () => {
  it('mide ~180 m para 60 s a 3 m/s', () => {
    const pts = synthWalk([{ seconds: 60, speedMs: 3 }]);
    const d = pathDistanceMeters(filterPoints(pts));
    expect(d).toBeGreaterThan(177);
    expect(d).toBeLessThan(183);
  });
});

describe('elevationGainMeters', () => {
  it('acumula solo el desnivel positivo por encima del umbral', () => {
    const pts = synthWalk([
      { seconds: 30, speedMs: 3, elevM: 20 },
      { seconds: 30, speedMs: 3, elevM: -20 },
      { seconds: 30, speedMs: 3, elevM: 10 },
    ]);
    const gain = elevationGainMeters(filterPoints(pts));
    expect(gain).toBeGreaterThan(27);
    expect(gain).toBeLessThan(33);
  });
});
