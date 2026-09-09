import { formatDuration, formatKm, formatPace } from './format';

describe('formatDuration', () => {
  it.each([
    [0, '0:00'],
    [5, '0:05'],
    [65, '1:05'],
    [305, '5:05'],
    [3725, '1:02:05'],
  ])('%i s → %s', (input, expected) => {
    expect(formatDuration(input)).toBe(expected);
  });
});

describe('formatPace', () => {
  it('333 s/km → 5:33', () => {
    expect(formatPace(333)).toBe('5:33');
  });
  it('redondeo a 60 s sube el minuto', () => {
    expect(formatPace(299.6)).toBe('5:00');
  });
  it('0 o negativo → --:--', () => {
    expect(formatPace(0)).toBe('--:--');
    expect(formatPace(-1)).toBe('--:--');
  });
});

describe('formatKm', () => {
  it('2410 m → 2.41', () => {
    expect(formatKm(2410)).toBe('2.41');
  });
});
