import {
  buildProfile,
  elevationGainFromProfile,
  elevationGainInWindow,
  sampleForDem,
  smoothSeries,
  splitContiguousRuns,
} from './elevation';
import { synthWalk } from './testutils';

describe('sampleForDem', () => {
  it('muestrea cada stepM de recorrido acumulado, no cada N puntos', () => {
    const pts = synthWalk([{ seconds: 300, speedMs: 3 }]); // 900 m
    const sampled = sampleForDem(pts, 90);
    // ~900m / 90m ≈ 10 muestras, +/- 1 por el punto final añadido
    expect(sampled.length).toBeGreaterThanOrEqual(9);
    expect(sampled.length).toBeLessThanOrEqual(12);
  });

  it('incluye siempre el primer y el último punto', () => {
    const pts = synthWalk([{ seconds: 120, speedMs: 3 }]);
    const sampled = sampleForDem(pts, 90);
    expect(sampled[0]).toBe(pts[0]);
    expect(sampled[sampled.length - 1]).toBe(pts[pts.length - 1]);
  });

  it('array vacío en, array vacío fuera', () => {
    expect(sampleForDem([], 90)).toEqual([]);
  });
});

describe('splitContiguousRuns', () => {
  it('no corta una ruta normal sin saltos', () => {
    const pts = synthWalk([{ seconds: 300, speedMs: 3 }]);
    const sampled = sampleForDem(pts, 90);
    expect(splitContiguousRuns(sampled, 90)).toHaveLength(1);
  });

  it('corta donde el salto en línea recta es mucho mayor que el paso (hueco de origen)', () => {
    // dos muestras "vecinas" en el mismo array pero a 1 km en línea recta:
    // el caso de un hueco de datos que dejó dos puntos filtrados consecutivos.
    const a = synthWalk([{ seconds: 60, speedMs: 3 }]);
    const far = { ...a[a.length - 1], lat: a[a.length - 1].lat + 1000 / 111_320 };
    const samples = [...a, far];
    const runs = splitContiguousRuns(samples, 90);
    expect(runs).toHaveLength(2);
  });
});

describe('smoothSeries', () => {
  it('con ventana 0 devuelve la serie tal cual', () => {
    expect(smoothSeries([1, 5, 2, 8], 0)).toEqual([1, 5, 2, 8]);
  });

  it('suaviza un pico aislado', () => {
    const smoothed = smoothSeries([10, 10, 50, 10, 10], 1);
    // el pico se reparte con sus vecinos, ya no es 50
    expect(smoothed[2]).toBeLessThan(50);
    expect(smoothed[2]).toBeGreaterThan(10);
  });

  it('no altera la longitud ni inventa valores en los bordes', () => {
    const s = smoothSeries([1, 2, 3], 1);
    expect(s).toHaveLength(3);
  });
});

describe('buildProfile + elevationGainFromProfile', () => {
  it('sube 30 m limpios → ganancia ≈ 30 m', () => {
    const pts = synthWalk([{ seconds: 300, speedMs: 3 }]);
    const samples = sampleForDem(pts, 90);
    const n = samples.length;
    const elevations = samples.map((_, i) => 100 + (30 * i) / (n - 1));
    const profile = buildProfile(samples, elevations, { stepM: 90, smoothWindow: 0 });
    const gain = elevationGainFromProfile(profile);
    expect(gain).toBeGreaterThan(27);
    expect(gain).toBeLessThan(31);
  });

  it('ruido pequeño por debajo del umbral no acumula ganancia', () => {
    const pts = synthWalk([{ seconds: 300, speedMs: 3 }]);
    const samples = sampleForDem(pts, 90);
    const elevations = samples.map((_, i) => 100 + (i % 2 === 0 ? 0.3 : -0.3));
    const profile = buildProfile(samples, elevations, { stepM: 90, smoothWindow: 0 });
    expect(elevationGainFromProfile(profile)).toBe(0);
  });

  it('un corte de perfil (hueco de origen) no mezcla ganancia entre tramos', () => {
    // tramo 1: sube 5 m. Hueco. tramo 2: cae 40 m (irrelevante, es bajada) y
    // sube 3 m. La ganancia total debe ser la suma de cada tramo por
    // separado, nunca contaminada por el salto entre el último punto del
    // tramo 1 y el primero del tramo 2.
    const a = synthWalk([{ seconds: 60, speedMs: 3, elevM: 5 }]);
    const far = { ...a[a.length - 1], lat: a[a.length - 1].lat + 1000 / 111_320, altitude: -35 };
    const b = synthWalk([{ seconds: 60, speedMs: 3, elevM: 3 }], {
      startLat: far.lat,
      startTs: far.ts + 60_000,
    }).map((p) => ({ ...p, altitude: (p.altitude ?? 0) - 135 })); // arranca en -35, sube 3

    const samples = [...a, far, ...b];
    const profile = buildProfile(samples, samples.map((p) => p.altitude ?? 0), {
      stepM: 90,
      smoothWindow: 0,
    });
    // sin el corte, el salto de -35 no debería restar del total (es bajada,
    // no cuenta) pero SÍ cambiaría la referencia y podría alterar cuánto de
    // la subida siguiente se cuenta. Con el corte, cada tramo es independiente.
    const gain = elevationGainFromProfile(profile);
    expect(gain).toBeGreaterThan(6);
    expect(gain).toBeLessThan(10);
  });
});

describe('elevationGainInWindow', () => {
  it('ventana dentro de un único tramo coincide con el total de ese tramo', () => {
    const pts = synthWalk([{ seconds: 300, speedMs: 3 }]);
    const samples = sampleForDem(pts, 90);
    const n = samples.length;
    const elevations = samples.map((_, i) => 100 + (30 * i) / (n - 1));
    const profile = buildProfile(samples, elevations, { stepM: 90, smoothWindow: 0 });

    const full = elevationGainFromProfile(profile);
    const windowed = elevationGainInWindow(profile, samples[0].ts, samples[n - 1].ts);
    expect(windowed).toBeCloseTo(full, 0);
  });

  it('ventana vacía o fuera de rango no revienta', () => {
    const pts = synthWalk([{ seconds: 120, speedMs: 3 }]);
    const samples = sampleForDem(pts, 90);
    const profile = buildProfile(samples, samples.map((p) => p.altitude ?? 0), { stepM: 90 });
    expect(elevationGainInWindow(profile, 0, 1)).toBe(0);
  });
});
