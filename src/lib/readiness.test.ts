import { describe, expect, it } from 'vitest';
import { addDays, dateRange } from './dates';
import type { DayHealth } from './garmin/types';
import { readiness, readinessLabel } from './readiness';

const H = 3600;
const TODAY = '2026-11-22';

/** 70 días con algo de variación alrededor de valores normales. */
function days(): DayHealth[] {
  return dateRange(addDays(TODAY, -69), TODAY).map((date, i) => ({
    date,
    hrvLastNight: 72 + ((i % 5) - 2) * 3,
    restingHr: 41 + ((i % 3) - 1),
    sleepS: (7.5 + ((i % 4) - 1.5) * 0.3) * H,
    sleepNeedS: 7.5 * H,
  }));
}
const tsbFlat = (v = 0) => new Map(dateRange(addDays(TODAY, -69), TODAY).map((d, i) => [d, v + ((i % 4) - 1.5)]));

describe('disposición (readiness)', () => {
  it('un día normal ronda 50', () => {
    const d = days();
    const today = d.at(-1)!;
    today.hrvLastNight = 72;
    today.restingHr = 41;
    today.sleepS = 7.5 * H;
    const r = readiness(d, TODAY, tsbFlat())!;
    expect(r.score).toBeGreaterThanOrEqual(40);
    expect(r.score).toBeLessThanOrEqual(60);
    expect(r.parts.map((p) => p.key)).toEqual(['hrv', 'rhr', 'sleep', 'tsb']);
    expect(r.missing).toEqual([]);
  });

  it('VFC baja, FC alta y poco sueño hunden la puntuación', () => {
    const d = days();
    const today = d.at(-1)!;
    today.hrvLastNight = 50;
    today.restingHr = 48;
    today.sleepS = 4.9 * H;
    const r = readiness(d, TODAY, tsbFlat())!;
    expect(r.score).toBeLessThan(25);
    expect(readinessLabel(r.score)).toBe('Muy por debajo de lo normal');
    // Cada z se limita a ±3
    for (const p of r.parts) expect(Math.abs(p.z)).toBeLessThanOrEqual(3);
  });

  it('la FC en reposo alta resta (z invertida)', () => {
    const d = days();
    d.at(-1)!.restingHr = 46;
    const r = readiness(d, TODAY, tsbFlat())!;
    expect(r.parts.find((p) => p.key === 'rhr')!.z).toBeLessThan(0);
  });

  it('el sueño se compara con el objetivo, no con tu media', () => {
    const d = days().map((x, i) => ({ ...x, sleepS: (5.5 + (i % 3) * 0.2) * H }));
    d.at(-1)!.sleepS = 5.5 * H;
    const r = readiness(d, TODAY, tsbFlat(), 7.5 * H)!;
    // Dormir 5,5 h es lo habitual aquí, pero 2 h por debajo del objetivo
    expect(r.parts.find((p) => p.key === 'sleep')!.z).toBeLessThan(-2);
  });

  it('sin datos suficientes no da puntuación; con 2 componentes sí, y reparte el peso', () => {
    const d = days().map((x) => ({ date: x.date, hrvLastNight: x.hrvLastNight }));
    expect(readiness(d, TODAY, new Map())).toBeUndefined();
    const r = readiness(d, TODAY, tsbFlat())!;
    expect(r.parts.map((p) => p.key)).toEqual(['hrv', 'tsb']);
    expect(r.missing).toEqual(['rhr', 'sleep']);
  });
});
