import {
  LEVEL_NAMES,
  dayStreak,
  levelForXp,
  totalXp,
  xpForLevel,
  xpForRun,
} from './progress';
import type { RunSummary } from './types';

/** Carrera de prueba. `startedAt` a mediodía para no rozar el cambio de día. */
function run(partial: Partial<RunSummary> & { id: number }): RunSummary {
  return {
    startedAt: new Date(2026, 0, 15, 12, 0, 0).getTime(),
    distanceM: 0,
    movingTimeS: 0,
    elevGainM: 0,
    ...partial,
  };
}

describe('xpForRun', () => {
  it('5 km / 30 min ≈ 650 XP', () => {
    expect(xpForRun(run({ id: 1, distanceM: 5000, movingTimeS: 1800 }))).toBe(650);
  });
  it('carrera vacía = 0', () => {
    expect(xpForRun(run({ id: 1 }))).toBe(0);
  });
  it('totalXp suma todas', () => {
    const runs = [
      run({ id: 1, distanceM: 5000, movingTimeS: 1800 }),
      run({ id: 2, distanceM: 3000, movingTimeS: 1200 }),
    ];
    expect(totalXp(runs)).toBe(650 + 400);
  });
});

describe('xpForLevel', () => {
  it('nivel 1 no cuesta nada', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(0)).toBe(0);
  });
  it('curva cuadrática creciente', () => {
    expect(xpForLevel(2)).toBe(160);
    expect(xpForLevel(3)).toBe(640);
    expect(xpForLevel(5)).toBe(2560);
    for (let n = 2; n <= LEVEL_NAMES.length; n++) {
      expect(xpForLevel(n)).toBeGreaterThan(xpForLevel(n - 1));
    }
  });
});

describe('levelForXp', () => {
  it('0 XP → nivel 1, arranque', () => {
    const p = levelForXp(0);
    expect(p.level).toBe(1);
    expect(p.name).toBe(LEVEL_NAMES[0]);
    expect(p.progress).toBe(0);
    expect(p.xpAtNextLevel).toBe(160);
  });
  it('justo en el umbral sube de nivel', () => {
    expect(levelForXp(160).level).toBe(2);
    expect(levelForXp(159).level).toBe(1);
  });
  it('a mitad de camino, progress ≈ 0.5', () => {
    // nivel 2 va de 160 a 640; el punto medio es 400
    const p = levelForXp(400);
    expect(p.level).toBe(2);
    expect(p.progress).toBeCloseTo(0.5, 5);
  });
  it('XP enorme → nivel máximo con progress 1 y sin siguiente', () => {
    const p = levelForXp(10_000_000);
    expect(p.level).toBe(LEVEL_NAMES.length);
    expect(p.xpAtNextLevel).toBeNull();
    expect(p.progress).toBe(1);
  });
  it('XP negativa se trata como 0', () => {
    expect(levelForXp(-5).level).toBe(1);
  });
});

describe('dayStreak', () => {
  const noon = (y: number, m: number, d: number) => new Date(y, m, d, 12, 0, 0).getTime();

  it('sin carreras → 0', () => {
    expect(dayStreak([], noon(2026, 0, 20))).toBe(0);
  });

  it('carrera hoy → 1', () => {
    const runs = [run({ id: 1, startedAt: noon(2026, 0, 20) })];
    expect(dayStreak(runs, noon(2026, 0, 20))).toBe(1);
  });

  it('tres días seguidos terminando hoy → 3', () => {
    const runs = [
      run({ id: 1, startedAt: noon(2026, 0, 18) }),
      run({ id: 2, startedAt: noon(2026, 0, 19) }),
      run({ id: 3, startedAt: noon(2026, 0, 20) }),
    ];
    expect(dayStreak(runs, noon(2026, 0, 20))).toBe(3);
  });

  it('corriste ayer pero aún no hoy → la racha sigue viva', () => {
    const runs = [
      run({ id: 1, startedAt: noon(2026, 0, 18) }),
      run({ id: 2, startedAt: noon(2026, 0, 19) }),
    ];
    expect(dayStreak(runs, noon(2026, 0, 20))).toBe(2);
  });

  it('último día con carrera fue anteayer → racha rota', () => {
    const runs = [run({ id: 1, startedAt: noon(2026, 0, 18) })];
    expect(dayStreak(runs, noon(2026, 0, 20))).toBe(0);
  });

  it('un hueco en medio corta la cuenta en el tramo reciente', () => {
    const runs = [
      run({ id: 1, startedAt: noon(2026, 0, 15) }),
      run({ id: 2, startedAt: noon(2026, 0, 16) }),
      // hueco el 17
      run({ id: 3, startedAt: noon(2026, 0, 18) }),
      run({ id: 4, startedAt: noon(2026, 0, 19) }),
    ];
    expect(dayStreak(runs, noon(2026, 0, 19))).toBe(2);
  });

  it('dos carreras el mismo día no inflan la racha', () => {
    const runs = [
      run({ id: 1, startedAt: new Date(2026, 0, 20, 8, 0).getTime() }),
      run({ id: 2, startedAt: new Date(2026, 0, 20, 19, 0).getTime() }),
    ];
    expect(dayStreak(runs, noon(2026, 0, 20))).toBe(1);
  });

  it('cruza el fin de mes', () => {
    const runs = [
      run({ id: 1, startedAt: noon(2026, 0, 30) }),
      run({ id: 2, startedAt: noon(2026, 0, 31) }),
      run({ id: 3, startedAt: noon(2026, 1, 1) }),
    ];
    expect(dayStreak(runs, noon(2026, 1, 1))).toBe(3);
  });
});
