import { describe, expect, it } from 'vitest';
import { pctChange, progressVerdict, recordsThisYear, trendDir } from './progress';

describe('¿Estás mejorando?', () => {
  it('dirección con umbral y sentido', () => {
    expect(trendDir(2, 1)).toBe('better');
    expect(trendDir(-0.5, 1)).toBe('same');
    expect(trendDir(-3, 1)).toBe('worse');
    expect(trendDir(-3, 1, false)).toBe('better');
    expect(trendDir(undefined, 1)).toBeUndefined();
  });

  it('cambio relativo', () => {
    expect(pctChange(110, 100)).toBeCloseTo(10, 5);
    expect(pctChange(1, 0)).toBeUndefined();
    expect(pctChange(undefined, 3)).toBeUndefined();
  });

  it('marcas del año que igualan o superan el histórico', () => {
    const rows = [
      { period: { timeS: 1200 }, best: { timeS: 1200 } },
      { period: { timeS: 2600 }, best: { timeS: 2500 } },
      { best: { timeS: 5500 } },
      { period: { timeS: 300 } },
    ];
    expect(recordsThisYear(rows)).toEqual({ count: 1, total: 3 });
  });

  it('veredicto', () => {
    expect(progressVerdict(['better', 'better', 'same']).tone).toBe('ok');
    expect(progressVerdict(['worse', 'worse', undefined]).title).toBe('Vas a menos');
    expect(progressVerdict(['same', 'same']).title).toMatch(/^Estable/);
    expect(progressVerdict(['better', 'worse', 'same']).title).toBe('Señales mixtas: 1 a favor y 1 en contra');
    expect(progressVerdict(['better', undefined]).tone).toBe('muted');
  });
});
