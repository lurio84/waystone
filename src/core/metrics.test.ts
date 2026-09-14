import {
  computeMetrics,
  computeSplits,
  dataGapIntervals,
  DEFAULT_DATA_GAP_S,
  isPausedByEvents,
  manualPauseIntervals,
  mergeIntervals,
  pausedMsWithin,
  routeSegments,
} from './metrics';
import { haversineMeters } from './geo';
import { synthWalk } from './testutils';
import type { RunEvent } from './types';

describe('mergeIntervals', () => {
  it('fusiona solapados y ordena', () => {
    const merged = mergeIntervals([
      { start: 100, end: 200 },
      { start: 150, end: 250 },
      { start: 400, end: 500 },
    ]);
    expect(merged).toEqual([
      { start: 100, end: 250 },
      { start: 400, end: 500 },
    ]);
  });
});

describe('manualPauseIntervals', () => {
  it('empareja pause con resume', () => {
    const events: RunEvent[] = [
      { ts: 1000, kind: 'pause' },
      { ts: 3000, kind: 'resume' },
    ];
    expect(manualPauseIntervals(events, 9999)).toEqual([{ start: 1000, end: 3000 }]);
  });

  it('cierra una pausa sin resume al final de la carrera', () => {
    const events: RunEvent[] = [{ ts: 1000, kind: 'pause' }];
    expect(manualPauseIntervals(events, 5000)).toEqual([{ start: 1000, end: 5000 }]);
  });
});

describe('dataGapIntervals', () => {
  it('muestreo continuo (1 pt/s) → ningún hueco', () => {
    const pts = synthWalk([{ seconds: 200, speedMs: 3 }]);
    expect(dataGapIntervals(pts)).toEqual([]);
  });

  it('un hueco de varios minutos → un intervalo [antes, después]', () => {
    const a = synthWalk([{ seconds: 60, speedMs: 3 }], { startTs: 1_000_000_000_000 });
    const last = a[a.length - 1];
    const b = synthWalk([{ seconds: 60, speedMs: 3 }], { startTs: last.ts + 600_000 });
    const gaps = dataGapIntervals([...a, ...b]);
    expect(gaps).toEqual([{ start: last.ts, end: last.ts + 600_000 }]);
  });

  it('un hueco por debajo del umbral no cuenta', () => {
    const a = synthWalk([{ seconds: 60, speedMs: 3 }], { startTs: 1_000_000_000_000 });
    const last = a[a.length - 1];
    const b = synthWalk([{ seconds: 60, speedMs: 3 }], {
      startTs: last.ts + (DEFAULT_DATA_GAP_S - 5) * 1000,
    });
    expect(dataGapIntervals([...a, ...b])).toEqual([]);
  });

  it('dos huecos → dos intervalos', () => {
    const a = synthWalk([{ seconds: 30, speedMs: 3 }], { startTs: 1_000_000_000_000 });
    const b = synthWalk([{ seconds: 30, speedMs: 3 }], {
      startTs: a[a.length - 1].ts + 300_000,
    });
    const c = synthWalk([{ seconds: 30, speedMs: 3 }], {
      startTs: b[b.length - 1].ts + 400_000,
    });
    expect(dataGapIntervals([...a, ...b, ...c])).toHaveLength(2);
  });
});

describe('isPausedByEvents', () => {
  it('sin eventos → no está en pausa', () => {
    expect(isPausedByEvents([])).toBe(false);
  });

  it('un pause sin resume → en pausa', () => {
    expect(isPausedByEvents([{ ts: 1000, kind: 'pause' }])).toBe(true);
  });

  it('pause + resume → no está en pausa', () => {
    expect(
      isPausedByEvents([
        { ts: 1000, kind: 'pause' },
        { ts: 2000, kind: 'resume' },
      ]),
    ).toBe(false);
  });

  it('gana el último evento: pause, resume, pause → en pausa', () => {
    expect(
      isPausedByEvents([
        { ts: 1000, kind: 'pause' },
        { ts: 2000, kind: 'resume' },
        { ts: 3000, kind: 'pause' },
      ]),
    ).toBe(true);
  });

  it('ordena por ts aunque lleguen desordenados', () => {
    expect(
      isPausedByEvents([
        { ts: 3000, kind: 'resume' },
        { ts: 1000, kind: 'pause' },
      ]),
    ).toBe(false);
  });
});

describe('pausedMsWithin', () => {
  it('recorta a la ventana pedida', () => {
    const merged = [{ start: 0, end: 10_000 }];
    expect(pausedMsWithin(merged, 2000, 5000)).toBe(3000);
  });
});

describe('computeMetrics', () => {
  it('carrera limpia de 5 min a 3 m/s → ~900 m, sin tiempo parado', () => {
    const pts = synthWalk([{ seconds: 300, speedMs: 3 }]);
    const m = computeMetrics(pts, []);
    expect(m.distanceM).toBeGreaterThan(890);
    expect(m.distanceM).toBeLessThan(910);
    expect(m.elapsedTimeS).toBeCloseTo(300, 0);
    expect(m.movingTimeS).toBeCloseTo(300, 0);
    // ritmo ~5:33 /km = 333 s/km
    expect(m.avgPaceSPerKm).toBeGreaterThan(325);
    expect(m.avgPaceSPerKm).toBeLessThan(342);
  });

  it('el tiempo parado en un semáforo no cuenta como tiempo en movimiento', () => {
    const pts = synthWalk([
      { seconds: 120, speedMs: 3 },
      { seconds: 60, speedMs: 0 },
      { seconds: 120, speedMs: 3 },
    ]);
    const m = computeMetrics(pts, []);
    expect(m.elapsedTimeS).toBeCloseTo(300, 0);
    // ~60 s de autopausa fuera (con algo de margen por el retardo de entrada)
    expect(m.movingTimeS).toBeGreaterThan(235);
    expect(m.movingTimeS).toBeLessThan(255);
  });

  it('una pausa manual también sale del tiempo en movimiento', () => {
    const startTs = 1_000_000_000_000;
    const pts = synthWalk([{ seconds: 300, speedMs: 3 }], { startTs });
    const events: RunEvent[] = [
      { ts: startTs + 100_000, kind: 'pause' },
      { ts: startTs + 130_000, kind: 'resume' },
    ];
    const m = computeMetrics(pts, events);
    expect(m.movingTimeS).toBeCloseTo(270, 0);
  });

  it('devuelve ceros con menos de 2 puntos', () => {
    expect(computeMetrics([], [])).toEqual({
      distanceM: 0,
      movingTimeS: 0,
      elapsedTimeS: 0,
      avgPaceSPerKm: 0,
      elevGainM: 0,
    });
  });

  it('estar parado con el GPS bailando NO suma distancia ni ritmo', () => {
    // 90 s inmóvil, pero cada punto se mueve ±8 m por deriva del GPS
    const pts = synthWalk([{ seconds: 90, speedMs: 0, jitterM: 8 }]);
    const m = computeMetrics(pts, []);
    expect(m.distanceM).toBeLessThan(50);
    expect(m.avgPaceSPerKm).toBe(0); // por debajo de MIN_PACE_DISTANCE_M
  });

  it('la deriva del GPS durante una parada larga no infla la distancia', () => {
    const pts = synthWalk([
      { seconds: 120, speedMs: 3 }, // 360 m corriendo
      { seconds: 120, speedMs: 0, jitterM: 10 }, // parado, GPS bailando fuerte
      { seconds: 120, speedMs: 3 }, // otros 360 m
    ]);
    const m = computeMetrics(pts, []);
    expect(m.distanceM).toBeGreaterThan(690);
    expect(m.distanceM).toBeLessThan(770);
    // ritmo coherente con ~240 s en movimiento sobre ~720 m
    expect(m.avgPaceSPerKm).toBeGreaterThan(300);
    expect(m.avgPaceSPerKm).toBeLessThan(370);
  });

  it('no da ritmo por debajo de 50 m (ruido, no zancada)', () => {
    const pts = synthWalk([{ seconds: 12, speedMs: 3 }]); // ~36 m
    const m = computeMetrics(pts, []);
    expect(m.distanceM).toBeLessThan(50);
    expect(m.avgPaceSPerKm).toBe(0);
  });

  describe('ventana temporal desde el reloj de la carrera (startedAt/endedAt)', () => {
    const startTs = 1_000_000_000_000;

    // punto fantasma: expo-location entrega la última ubicación conocida como
    // primer punto, con su ts original (aquí −483 s) y a ~120 m del inicio real
    const phantom = {
      ts: startTs - 483_000,
      lat: 37.388,
      lon: -5.9845,
      altitude: 100,
      accuracy: 5,
      speed: 0,
    };

    it('sin startedAt reproduce el bug: el punto fantasma infla elapsed', () => {
      const pts = [phantom, ...synthWalk([{ seconds: 300, speedMs: 3 }], { startTs })];
      const m = computeMetrics(pts, []);
      // 300 s reales + 483 s de desfase del fantasma
      expect(m.elapsedTimeS).toBeGreaterThan(700);
    });

    it('con startedAt descarta el fantasma: elapsed y distancia reales', () => {
      const pts = [phantom, ...synthWalk([{ seconds: 300, speedMs: 3 }], { startTs })];
      const m = computeMetrics(pts, [], { startedAt: startTs });
      expect(m.elapsedTimeS).toBeCloseTo(300, 0);
      // sin el salto de ~120 m desde el punto cacheado
      expect(m.distanceM).toBeGreaterThan(890);
      expect(m.distanceM).toBeLessThan(910);
    });

    it('carrera limpia: endedAt unos segundos tras el último punto → elapsed real', () => {
      const pts = synthWalk([{ seconds: 300, speedMs: 3 }], { startTs });
      const m = computeMetrics(pts, [], { startedAt: startTs, endedAt: startTs + 305_000 });
      expect(m.elapsedTimeS).toBeCloseTo(300, 0);
    });

    it('carrera matada a min 17 y terminada a min 75 → elapsed ≈ 17 min, no 75', () => {
      const pts = synthWalk([{ seconds: 17 * 60, speedMs: 3 }], { startTs });
      const m = computeMetrics(pts, [], {
        startedAt: startTs,
        endedAt: startTs + 75 * 60_000,
      });
      expect(m.elapsedTimeS).toBeCloseTo(17 * 60, 0);
    });

    it('startedAt sin endedAt (carrera en vivo) no rompe', () => {
      const pts = synthWalk([{ seconds: 300, speedMs: 3 }], { startTs });
      const m = computeMetrics(pts, [], { startedAt: startTs });
      expect(m.elapsedTimeS).toBeCloseTo(300, 0);
      expect(m.distanceM).toBeGreaterThan(890);
    });
  });

  describe('hueco largo de GPS (grabación muerta a media, P0)', () => {
    // FIXTURE PROVISIONAL — sintético y a imagen de lo que se espera. Se
    // sustituye por el export real de la primera carrera en que salte el P0
    // (ver plan). Los fixtures de make-fixture.ts subestiman este problema.
    const startTs = 1_000_000_000_000;

    /**
     * 17 min corriendo, el proceso muere, revive 13 min después ~2 km al
     * norte (el corredor siguió corriendo mientras la app estaba muerta),
     * 10 min más y "Terminar". Reloj total: 40 min.
     */
    function runWithGap() {
      const before = synthWalk([{ seconds: 17 * 60, speedMs: 3 }], { startTs });
      const last = before[before.length - 1];
      const gapMs = 13 * 60_000;
      const after = synthWalk([{ seconds: 10 * 60, speedMs: 3 }], {
        startTs: last.ts + gapMs,
        startLat: last.lat + 2000 / 111_320,
      });
      return {
        points: [...before, ...after],
        opts: { startedAt: startTs, endedAt: after[after.length - 1].ts },
      };
    }

    it('el hueco NO cuenta como tiempo en movimiento', () => {
      const { points, opts } = runWithGap();
      const m = computeMetrics(points, [], opts);
      // 1020 s + 600 s de carrera real ≈ 27 min; NADA de los 13 min muertos
      expect(m.movingTimeS).toBeGreaterThan(1550);
      expect(m.movingTimeS).toBeLessThan(1700);
    });

    it('el salto en línea recta del hueco NO cuenta como distancia', () => {
      const { points, opts } = runWithGap();
      const m = computeMetrics(points, [], opts);
      // ~3060 m + ~1800 m de carrera real; SIN los ~2000 m del teletransporte
      expect(m.distanceM).toBeGreaterThan(4650);
      expect(m.distanceM).toBeLessThan(5100);
    });

    it('el reloj de pared (elapsed) SÍ incluye el hueco', () => {
      const { points, opts } = runWithGap();
      const m = computeMetrics(points, [], opts);
      expect(m.elapsedTimeS).toBeCloseTo(40 * 60, 0);
    });

    it('la traza se parte en el hueco en vez de cruzarlo en recta', () => {
      const { points, opts } = runWithGap();
      const segs = routeSegments(points, [], opts);
      // dos tramos: antes y después del hueco
      expect(segs.length).toBeGreaterThanOrEqual(2);
      // dentro de cada tramo, ningún salto de 2 km
      for (const seg of segs) {
        let maxStep = 0;
        for (let i = 1; i < seg.length; i++) {
          maxStep = Math.max(maxStep, haversineMeters(seg[i - 1], seg[i]));
        }
        expect(maxStep).toBeLessThan(50);
      }
    });

    it('el umbral se propaga desde MetricsOptions', () => {
      // hueco de 10 s en mitad de una carrera por lo demás continua
      const a = synthWalk([{ seconds: 120, speedMs: 3 }], { startTs });
      const last = a[a.length - 1];
      const b = synthWalk([{ seconds: 120, speedMs: 3 }], {
        startTs: last.ts + 10_000,
        startLat: last.lat,
      });
      const pts = [...a, ...b];
      const o = { startedAt: startTs, endedAt: pts[pts.length - 1].ts };

      // con el umbral por defecto (20 s) el hueco de 10 s no cuenta
      expect(computeMetrics(pts, [], o).movingTimeS).toBeGreaterThan(245);
      // bajándolo a 5 s, esos 10 s salen del tiempo en movimiento
      const tight = computeMetrics(pts, [], { ...o, dataGapS: 5 }).movingTimeS;
      expect(tight).toBeLessThan(245);
      expect(tight).toBeGreaterThan(235);
    });
  });
});

describe('routeSegments — ventana de precisión degradada (sin hueco temporal)', () => {
  // El GPS sigue entregando a 1 Hz durante una ventana de mala precisión (un
  // cañón urbano, no un túnel): NO hay hueco temporal, así que
  // dataGapIntervals no lo ve. filterPoints descarta esos puntos por
  // accuracy, y dos puntos que antes estaban a 30 s uno de otro (con
  // recorrido real entre medias) quedan consecutivos en el mismo segmento →
  // salto en línea recta atravesando la ventana. Caso real medido en el
  // simulador `river-run` el 2026-09-11 (salto de 102,1 m dentro de un único
  // segmento).
  const startTs = 1_000_000_000_000;

  function runWithBadAccuracyWindow() {
    const points = synthWalk(
      [
        { seconds: 60, speedMs: 3 }, // 180 m normales
        { seconds: 30, speedMs: 3, accuracy: 40 }, // 90 m, precisión mala, sin hueco temporal
        { seconds: 60, speedMs: 3 }, // 180 m normales
      ],
      { startTs },
    );
    return {
      points,
      opts: { startedAt: startTs, endedAt: points[points.length - 1].ts },
    };
  }

  it('NO genera hueco temporal (dataGapIntervals ve la ventana llena a 1 Hz)', () => {
    const { points } = runWithBadAccuracyWindow();
    expect(dataGapIntervals(points)).toEqual([]);
  });

  it('la traza se corta en la ventana de mala precisión, no la cruza en recta', () => {
    const { points, opts } = runWithBadAccuracyWindow();
    const segs = routeSegments(points, [], opts);
    // sin el fix: 1 solo segmento con un salto de ~90 m en su interior
    expect(segs.length).toBeGreaterThanOrEqual(2);
    for (const seg of segs) {
      let maxStep = 0;
      for (let i = 1; i < seg.length; i++) {
        maxStep = Math.max(maxStep, haversineMeters(seg[i - 1], seg[i]));
      }
      expect(maxStep).toBeLessThan(10); // muestreo normal a 3 m/s ≈ 3 m/punto
    }
  });
});

describe('computeSplits', () => {
  it('parte 2.4 km a 4 m/s en 3 parciales (1000, 1000, ~400)', () => {
    const pts = synthWalk([{ seconds: 600, speedMs: 4 }]); // 2400 m
    const splits = computeSplits(pts, []);
    expect(splits).toHaveLength(3);
    expect(splits[0].distanceM).toBe(1000);
    expect(splits[1].distanceM).toBe(1000);
    expect(splits[2].distanceM).toBeGreaterThan(360);
    expect(splits[2].distanceM).toBeLessThan(440);
  });

  it('cada km completo dura ~250 s a 4 m/s', () => {
    const pts = synthWalk([{ seconds: 600, speedMs: 4 }]);
    const splits = computeSplits(pts, []);
    expect(splits[0].durationS).toBeGreaterThan(240);
    expect(splits[0].durationS).toBeLessThan(260);
    expect(splits[0].paceSPerKm).toBeCloseTo(splits[0].durationS, 0);
  });

  it('una parada dentro de un km infla su ritmo pero descuenta el tiempo parado', () => {
    const pts = synthWalk([
      { seconds: 125, speedMs: 4 }, // 500 m
      { seconds: 60, speedMs: 0 }, // parón
      { seconds: 125, speedMs: 4 }, // otros 500 m -> cierra km 1
      { seconds: 250, speedMs: 4 },
    ]);
    const splits = computeSplits(pts, []);
    // el primer km: ~250 s en movimiento pese a que el reloj marcó ~310 s
    expect(splits[0].durationS).toBeGreaterThan(235);
    expect(splits[0].durationS).toBeLessThan(275);
  });
});
