import { describe, expect, it } from 'vitest';
import { weightChange, weightTrend } from './weight';

describe('peso', () => {
  it('media de los pesajes de los 7 días anteriores (incluido el día)', () => {
    const t = weightTrend([
      { date: '2026-11-10', kg: 72 },
      { date: '2026-11-01', kg: 70 },
      { date: '2026-11-05', kg: 71 },
    ]);
    expect(t.map((p) => p.date)).toEqual(['2026-11-01', '2026-11-05', '2026-11-10']);
    expect(t[0].avg7).toBe(70);
    expect(t[1].avg7).toBe(70.5);
    // El 10: solo cuentan el 5 y el 10 (el 1 queda fuera de los 7 días)
    expect(t[2].avg7).toBe(71.5);
    expect(weightChange(t)).toBe(1.5);
    expect(weightChange(t.slice(0, 1))).toBeUndefined();
  });
});
