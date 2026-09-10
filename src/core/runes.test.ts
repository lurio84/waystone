import { RUNES, evaluateRunes } from './runes';
import type { RunSummary } from './types';

function run(partial: Partial<RunSummary> & { id: number }): RunSummary {
  return {
    startedAt: new Date(2026, 0, 15, 12, 0, 0).getTime(),
    distanceM: 0,
    movingTimeS: 0,
    elevGainM: 0,
    ...partial,
  };
}

const idsOf = (runs: RunSummary[]) => new Set(evaluateRunes(runs).map((u) => u.id));

describe('evaluateRunes', () => {
  it('sin carreras no desbloquea nada', () => {
    expect(evaluateRunes([])).toEqual([]);
  });

  it('la primera carrera da "primer-mojon"', () => {
    const unlocks = evaluateRunes([run({ id: 7, distanceM: 1200 })]);
    expect(unlocks).toEqual([{ id: 'primer-mojon', runId: 7, unlockedAt: run({ id: 7 }).startedAt }]);
  });

  it('unlockedAt es el startedAt de la carrera, no "ahora"', () => {
    const t = new Date(2025, 5, 1, 7, 30).getTime();
    const [u] = evaluateRunes([run({ id: 1, startedAt: t, distanceM: 6000 })]);
    expect(u.unlockedAt).toBe(t);
  });

  it('el resultado no depende del orden de entrada', () => {
    const t1 = new Date(2026, 0, 1, 12).getTime();
    const t2 = new Date(2026, 0, 3, 12).getTime();
    const runs = [
      run({ id: 1, startedAt: t1, distanceM: 5200 }),
      run({ id: 2, startedAt: t2, distanceM: 11000 }),
    ];
    const expected = [
      { id: 'primer-mojon', runId: 1, unlockedAt: t1 },
      { id: 'cinco-k', runId: 1, unlockedAt: t1 },
      { id: 'diez-k', runId: 2, unlockedAt: t2 },
    ];
    expect(evaluateRunes(runs)).toEqual(expected);
    expect(evaluateRunes([...runs].reverse())).toEqual(expected);
  });

  it('distancias: 5k y 10k se asignan a la primera carrera que las cruza', () => {
    const runs = [
      run({ id: 1, startedAt: new Date(2026, 0, 1, 12).getTime(), distanceM: 4000 }),
      run({ id: 2, startedAt: new Date(2026, 0, 2, 12).getTime(), distanceM: 5300 }),
      run({ id: 3, startedAt: new Date(2026, 0, 3, 12).getTime(), distanceM: 12000 }),
    ];
    const unlocks = evaluateRunes(runs);
    expect(unlocks.find((u) => u.id === 'cinco-k')?.runId).toBe(2);
    expect(unlocks.find((u) => u.id === 'diez-k')?.runId).toBe(3);
  });

  it('"bajo-las-estrellas" con una carrera nocturna', () => {
    expect(idsOf([run({ id: 1, startedAt: new Date(2026, 0, 15, 22, 30).getTime() })])).toContain(
      'bajo-las-estrellas',
    );
    expect(idsOf([run({ id: 1, startedAt: new Date(2026, 0, 15, 4, 0).getTime() })])).toContain(
      'bajo-las-estrellas',
    );
    expect(
      idsOf([run({ id: 1, startedAt: new Date(2026, 0, 15, 18, 0).getTime() })]),
    ).not.toContain('bajo-las-estrellas');
  });

  it('"antes-del-alba" solo entre las 5 y las 7', () => {
    expect(idsOf([run({ id: 1, startedAt: new Date(2026, 0, 15, 6, 15).getTime() })])).toContain(
      'antes-del-alba',
    );
    expect(idsOf([run({ id: 1, startedAt: new Date(2026, 0, 15, 7, 30).getTime() })])).not.toContain(
      'antes-del-alba',
    );
  });

  it('"tres-seguidas" se asigna a la carrera que completa el 3er día', () => {
    const runs = [
      run({ id: 1, startedAt: new Date(2026, 0, 10, 12).getTime() }),
      run({ id: 2, startedAt: new Date(2026, 0, 11, 12).getTime() }),
      run({ id: 3, startedAt: new Date(2026, 0, 12, 12).getTime() }),
      run({ id: 4, startedAt: new Date(2026, 0, 13, 12).getTime() }),
    ];
    expect(evaluateRunes(runs).find((u) => u.id === 'tres-seguidas')?.runId).toBe(3);
  });

  it('"tres-seguidas" no salta con un hueco', () => {
    const runs = [
      run({ id: 1, startedAt: new Date(2026, 0, 10, 12).getTime() }),
      run({ id: 2, startedAt: new Date(2026, 0, 11, 12).getTime() }),
      run({ id: 3, startedAt: new Date(2026, 0, 13, 12).getTime() }),
    ];
    expect(idsOf(runs)).not.toContain('tres-seguidas');
  });

  it('"centenario" lo gana la carrera que cruza los 100 km acumulados', () => {
    const runs = [
      run({ id: 1, startedAt: new Date(2026, 0, 1, 12).getTime(), distanceM: 40_000 }),
      run({ id: 2, startedAt: new Date(2026, 0, 2, 12).getTime(), distanceM: 40_000 }),
      run({ id: 3, startedAt: new Date(2026, 0, 3, 12).getTime(), distanceM: 25_000 }),
    ];
    expect(evaluateRunes(runs).find((u) => u.id === 'centenario')?.runId).toBe(3);
  });

  it('todos los ids del catálogo son únicos', () => {
    const ids = RUNES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
