import { describe, expect, it } from 'vitest';
import { deltaTrend, hrvTrend, median, sleepDebt, todayStatus, weeklyIntensity } from './baseline';
import { addDays } from './dates';
import type { DayHealth } from './garmin/types';

/** n días consecutivos terminando en 2026-11-22, con valores por defecto estables. */
function series(n: number, f: (i: number) => Partial<DayHealth> = () => ({})): DayHealth[] {
  return Array.from({ length: n }, (_, i) => ({
    date: addDays('2026-11-22', i - n + 1),
    hrvLastNight: 60 + (i % 3) - 1,
    restingHr: 50,
    sleepRespiration: 14,
    sleepS: 8 * 3600,
    sleepNeedS: 8 * 3600,
    ...f(i),
  }));
}
const fmt = { ms: (v: number) => `${Math.round(v)} ms`, hm: (s: number) => `${Math.round(s / 60)} min` };

describe('median', () => {
  it('par e impar', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeUndefined();
  });
});

describe('hrvTrend', () => {
  it('no da banda hasta tener 21 noches previas', () => {
    const t = hrvTrend(series(15));
    expect(t.at(-1)!.low).toBeUndefined();
    expect(t.at(-1)!.nights).toBe(14);
  });
  it('banda alrededor de la media geométrica y media de 7 días dentro', () => {
    const p = hrvTrend(series(70)).at(-1)!;
    expect(p.low!).toBeLessThan(60);
    expect(p.high!).toBeGreaterThan(59);
    expect(p.avg7!).toBeGreaterThan(p.low!);
    expect(p.avg7!).toBeLessThan(p.high!);
  });
});

describe('deltaTrend', () => {
  it('diferencia frente a la mediana de los días previos', () => {
    const days = series(40, (i) => ({ restingHr: i === 39 ? 57 : 50 }));
    const last = deltaTrend(days, (d) => d.restingHr, 60).at(-1)!;
    expect(last.base).toBe(50);
    expect(last.delta).toBe(7);
  });
});

describe('sleepDebt', () => {
  it('suma solo lo que falta', () => {
    const days = series(7, (i) => ({ sleepS: i < 2 ? 6 * 3600 : 9 * 3600 }));
    expect(sleepDebt(days).debtS).toBe(4 * 3600);
  });
});

describe('todayStatus', () => {
  it('normal cuando todo está en rango', () => {
    expect(todayStatus(series(70), fmt).state).toBe('normal');
  });
  it('alerta con FC alta, respiración alta, HRV baja y deuda de sueño', () => {
    const days = series(70, (i) =>
      i >= 63 ? { restingHr: 58, sleepRespiration: 16, hrvLastNight: 40, sleepS: 6 * 3600 } : {},
    );
    const s = todayStatus(days, fmt);
    expect(s.warns).toBe(4);
    expect(s.state).toBe('alert');
  });
  it('calibrando sin historial', () => {
    expect(todayStatus(series(5), fmt).state).toBe('calibrating');
  });
});

describe('weeklyIntensity', () => {
  it('suma moderados y vigorosos ×2 por semana de lunes a domingo', () => {
    const days: DayHealth[] = [
      { date: '2026-11-16', intensityModerate: 30, intensityVigorous: 10 }, // lunes
      { date: '2026-11-22', intensityModerate: 20, intensityVigorous: 0 }, // domingo misma semana
      { date: '2026-11-15', intensityModerate: 100, intensityVigorous: 0 }, // semana anterior
    ];
    const w = weeklyIntensity(days, 2, '2026-11-22');
    expect(w.map((x) => x.total)).toEqual([100, 70]);
    expect(w[1].vigorousX2).toBe(20);
  });
});
