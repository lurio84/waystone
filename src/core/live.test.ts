import { currentPaceSPerKm, isAutoPausedNow } from './live';
import { synthWalk } from './testutils';

describe('currentPaceSPerKm', () => {
  it('a 4 m/s da ~250 s/km', () => {
    const pts = synthWalk([{ seconds: 60, speedMs: 4 }]);
    const pace = currentPaceSPerKm(pts);
    expect(pace).toBeGreaterThan(240);
    expect(pace).toBeLessThan(262);
  });

  it('da 0 si llevas parado toda la ventana', () => {
    const pts = synthWalk([
      { seconds: 30, speedMs: 3 },
      { seconds: 30, speedMs: 0 },
    ]);
    expect(currentPaceSPerKm(pts, 20)).toBe(0);
  });

  it('refleja un cambio de ritmo reciente, no el promedio de toda la carrera', () => {
    const pts = synthWalk([
      { seconds: 120, speedMs: 2 }, // lento un rato largo
      { seconds: 30, speedMs: 5 }, // sprint final
    ]);
    const pace = currentPaceSPerKm(pts, 20);
    // ~200 s/km (5 m/s), no ~330 (media)
    expect(pace).toBeLessThan(230);
  });
});

describe('isAutoPausedNow', () => {
  it('false mientras corres', () => {
    expect(isAutoPausedNow(synthWalk([{ seconds: 60, speedMs: 3 }]))).toBe(false);
  });

  it('true si llevas parado más que el umbral', () => {
    const pts = synthWalk([
      { seconds: 30, speedMs: 3 },
      { seconds: 30, speedMs: 0 },
    ]);
    expect(isAutoPausedNow(pts)).toBe(true);
  });

  it('vuelve a false tras reanudar la marcha', () => {
    const pts = synthWalk([
      { seconds: 30, speedMs: 3 },
      { seconds: 30, speedMs: 0 },
      { seconds: 20, speedMs: 3 },
    ]);
    expect(isAutoPausedNow(pts)).toBe(false);
  });
});
