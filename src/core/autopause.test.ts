import { autoPauseIntervals, DEFAULT_AUTOPAUSE } from './autopause';
import { synthWalk } from './testutils';

describe('autoPauseIntervals', () => {
  it('no detecta pausa en una carrera continua', () => {
    const pts = synthWalk([{ seconds: 120, speedMs: 3 }]);
    expect(autoPauseIntervals(pts)).toHaveLength(0);
  });

  it('detecta una parada en semáforo y la data desde que empezó la lentitud', () => {
    const startTs = 1_000_000_000_000;
    const pts = synthWalk(
      [
        { seconds: 30, speedMs: 3 }, // corriendo
        { seconds: 40, speedMs: 0 }, // parado en el semáforo
        { seconds: 30, speedMs: 3 }, // sigue
      ],
      { startTs },
    );

    const ivs = autoPauseIntervals(pts);
    expect(ivs).toHaveLength(1);

    // la lentitud empieza a los 30 s; la pausa se data ahí, no a los 38 s
    const pauseStartOffsetS = (ivs[0].start - startTs) / 1000;
    expect(pauseStartOffsetS).toBeGreaterThanOrEqual(30);
    expect(pauseStartOffsetS).toBeLessThanOrEqual(32);

    // reanuda ~cuando vuelve a moverse (70 s)
    const resumeOffsetS = (ivs[0].end - startTs) / 1000;
    expect(resumeOffsetS).toBeGreaterThanOrEqual(69);
    expect(resumeOffsetS).toBeLessThanOrEqual(72);
  });

  it('no parpadea: un bandazo corto del GPS no dispara pausa', () => {
    const pts = synthWalk([
      { seconds: 30, speedMs: 3 },
      { seconds: 4, speedMs: 0 }, // menos de pauseAfterS
      { seconds: 30, speedMs: 3 },
    ]);
    expect(autoPauseIntervals(pts)).toHaveLength(0);
  });

  it('cierra la pausa al final si la carrera termina parada', () => {
    const pts = synthWalk([
      { seconds: 30, speedMs: 3 },
      { seconds: 30, speedMs: 0 },
    ]);
    const ivs = autoPauseIntervals(pts);
    expect(ivs).toHaveLength(1);
    expect(ivs[0].end).toBe(pts[pts.length - 1].ts);
  });

  it('funciona con velocidad derivada cuando el GPS no la reporta', () => {
    const pts = synthWalk([
      { seconds: 30, speedMs: 3, reportSpeed: false },
      { seconds: 40, speedMs: 0, reportSpeed: false },
      { seconds: 30, speedMs: 3, reportSpeed: false },
    ]);
    expect(autoPauseIntervals(pts)).toHaveLength(1);
  });

  it('respeta la histéresis: caminar lento tras la parada no cuenta como reanudar', () => {
    const pts = synthWalk([
      { seconds: 30, speedMs: 3 },
      { seconds: 20, speedMs: 0 },
      { seconds: 10, speedMs: 1.0 }, // entre pauseSpeed y resumeSpeed
      { seconds: 20, speedMs: 0 },
      { seconds: 30, speedMs: 3 },
    ]);
    // sigue siendo una única pausa: nunca se superó resumeSpeedMs de forma sostenida
    const ivs = autoPauseIntervals(pts);
    expect(ivs).toHaveLength(1);
  });

  it('devuelve vacío con menos de 2 puntos', () => {
    expect(autoPauseIntervals([])).toEqual([]);
    expect(autoPauseIntervals(synthWalk([]).slice(0, 1))).toEqual([]);
  });
});

describe('DEFAULT_AUTOPAUSE', () => {
  it('usa umbrales de entrada y salida distintos (histéresis)', () => {
    expect(DEFAULT_AUTOPAUSE.resumeSpeedMs).toBeGreaterThan(DEFAULT_AUTOPAUSE.pauseSpeedMs);
  });
});
