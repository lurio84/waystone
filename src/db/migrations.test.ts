import { MIGRATIONS, pendingMigrations, type Migration } from './migrations';

describe('pendingMigrations', () => {
  it('trata 0 y 1 como la misma versión (bootstrap)', () => {
    expect(pendingMigrations(0).map((m) => m.version)).toEqual([2, 3]);
    expect(pendingMigrations(1).map((m) => m.version)).toEqual([2, 3]);
  });

  it('aplica solo los pasos por encima de la versión actual', () => {
    expect(pendingMigrations(2).map((m) => m.version)).toEqual([3]);
    expect(pendingMigrations(3)).toEqual([]);
  });

  it('no devuelve nada si la BD va por delante de la lista', () => {
    expect(pendingMigrations(99)).toEqual([]);
  });

  it('devuelve los pasos ordenados por versión aunque la lista no lo esté', () => {
    const unsorted: Migration[] = [
      { version: 3, label: 'c', up: () => {} },
      { version: 2, label: 'b', up: () => {} },
    ];
    expect(pendingMigrations(1, unsorted).map((m) => m.version)).toEqual([2, 3]);
  });
});

describe('MIGRATIONS (invariantes)', () => {
  it('versiones estrictamente crecientes y empezando en 2', () => {
    const versions = MIGRATIONS.map((m) => m.version);
    expect(versions[0]).toBe(2);
    for (let i = 1; i < versions.length; i++) {
      expect(versions[i]).toBeGreaterThan(versions[i - 1]);
    }
  });
});
