import { describe, expect, it } from 'vitest';
import { criticalSpeed, efTrend, efficiencyFactor, gradeFactor, isComparableRun, minettiCost, paceAtHr, predictTime, riegel, vdot } from './efficiency';
import type { Activity } from './garmin/types';

const run = (over: Partial<Activity> = {}): Activity =>
  ({ id: 1, name: 'x', typeKey: 'running', startLocal: '2026-11-01 08:00:00', date: '2026-11-01', distanceKm: 10, durationS: 3000, movingS: 3000, avgHr: 145, elevationGainM: 40, trainingEffectLabel: 'AEROBIC_BASE', hrZonesS: [0, 0, 0, 0, 0], bestEfforts: {}, isPr: false, ...over }) as Activity;

describe('Minetti', () => {
  it('llano = 3,6 J/kg/m y subir cuesta más', () => {
    expect(minettiCost(0)).toBeCloseTo(3.6, 5);
    expect(minettiCost(0.1)).toBeCloseTo(5.97, 1);
    expect(gradeFactor(0.1)).toBeGreaterThan(1.6);
    expect(gradeFactor(-0.05)).toBeLessThan(1);
  });
});

describe('EF y carreras comparables', () => {
  it('EF = m/min ÷ ppm', () => {
    // 10 km en 50 min = 200 m/min; 200/145 ≈ 1,379
    expect(efficiencyFactor(run())).toBeCloseTo(1.379, 3);
    expect(paceAtHr(200 / 145, 145)).toBeCloseTo(300, 5);
  });
  it('descarta series, trail, mucho desnivel y sesiones cortas', () => {
    expect(isComparableRun(run())).toBe(true);
    expect(isComparableRun(run({ trainingEffectLabel: 'VO2MAX' }))).toBe(false);
    expect(isComparableRun(run({ typeKey: 'trail_running' }))).toBe(false);
    expect(isComparableRun(run({ elevationGainM: 300 }))).toBe(false);
    expect(isComparableRun(run({ movingS: 20 * 60 }))).toBe(false);
  });
  it('media de 28 días', () => {
    const t = efTrend([run({ date: '2026-11-01' }), run({ id: 2, date: '2026-11-10', distanceKm: 11 })]);
    expect(t).toHaveLength(2);
    expect(t[1].avg28).toBeCloseTo((t[0].ef + t[1].ef) / 2, 6);
  });
});

describe('VDOT y predicción', () => {
  it('coincide con las tablas de Daniels', () => {
    expect(vdot(5000, 20 * 60)).toBeCloseTo(49.8, 0);
    expect(vdot(10000, 40 * 60)).toBeCloseTo(51.9, 0);
  });
  it('predice tiempos coherentes', () => {
    const v = vdot(10000, 40 * 60);
    expect(predictTime(v, 10000)).toBeCloseTo(2400, -1);
    // VDOT ~52 → maratón ~3:04 (tablas de Daniels)
    expect(predictTime(v, 42195) / 60).toBeGreaterThan(178);
    expect(predictTime(v, 42195) / 60).toBeLessThan(190);
    expect(riegel(10000, 2400, 21097.5)).toBeCloseTo(2400 * 2.1097 ** 1.06, 0);
  });
  it('velocidad crítica por regresión', () => {
    // marcas perfectamente lineales con CS = 4 m/s y D′ = 200 m
    const e = [1000, 5000, 10000].map((d) => ({ distance: d as 1000, timeS: (d - 200) / 4 }));
    const cs = criticalSpeed(e)!;
    expect(cs.csMs).toBeCloseTo(4, 6);
    expect(cs.dPrimeM).toBeCloseTo(200, 6);
  });
});
