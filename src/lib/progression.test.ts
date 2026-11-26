import { describe, expect, it } from 'vitest';
import { predictTime, vdot } from './efficiency';
import type { Activity } from './garmin/types';
import { analyzeRace, isVo2Candidate, predictionTrend, vo2At, vo2AtSpeed, vo2FromRun, vo2Trend } from './progression';
import { raceTime } from './races';

const run = (date: string, over: Partial<Activity> = {}): Activity => ({
  id: Number(date.replaceAll('-', '')),
  name: 'x',
  typeKey: 'running',
  startLocal: `${date} 08:00:00`,
  date,
  distanceKm: 10,
  durationS: 3000,
  movingS: 3000,
  avgHr: 150,
  hrZonesS: [0, 0, 0, 0, 0],
  bestEfforts: {},
  isPr: false,
  ...over,
});

describe('VO2máx estimado por sesión', () => {
  it('coste de oxígeno a 200 m/min (5:00 /km) ≈ 36,0 ml/kg/min', () => {
    expect(vo2AtSpeed(200)).toBeCloseTo(36.01, 1);
  });

  it('coste del ritmo / fracción de VO2máx de la FC (Swain)', () => {
    // 10 km en 50 min = 200 m/min → 36,0; 150/192 = 78,1 % FCmáx → (0,781 − 0,37)/0,64 = 64,3 % VO2máx
    expect(vo2FromRun(run('2026-11-01'), 192)).toBeCloseTo(36.01 / ((150 / 192 - 0.37) / 0.64), 1);
  });

  it('descarta FC fuera del 65–95 % de la máxima', () => {
    expect(vo2FromRun(run('2026-11-01', { avgHr: 110 }), 192)).toBeUndefined();
    expect(vo2FromRun(run('2026-11-01', { avgHr: 188 }), 192)).toBeUndefined();
  });

  it('solo carreras de asfalto o cinta, de 20 a 150 min y poco desnivel', () => {
    expect(isVo2Candidate(run('2026-11-01'))).toBe(true);
    expect(isVo2Candidate(run('2026-11-01', { typeKey: 'trail_running' }))).toBe(false);
    expect(isVo2Candidate(run('2026-11-01', { movingS: 900 }))).toBe(false);
    expect(isVo2Candidate(run('2026-11-01', { elevationGainM: 300 }))).toBe(false);
    expect(isVo2Candidate(run('2026-11-01', { avgHr: undefined }))).toBe(false);
  });

  it('media móvil de 28 días y valor en una fecha', () => {
    const t = vo2Trend([run('2026-10-01'), run('2026-10-10'), run('2026-11-20')], 192);
    expect(t[0].avg28).toBeUndefined();
    expect(t[1].avg28).toBeCloseTo(t[0].value, 5);
    expect(t[2].avg28).toBeUndefined();
    expect(vo2At(t, '2026-11-25')).toBeCloseTo(t[1].avg28!, 5);
    expect(vo2At(t, '2026-09-01')).toBeUndefined();
  });
});

describe('pronósticos a lo largo del tiempo', () => {
  it('cada semana usa el VO2máx estimado (media de 28 días) como VDOT', () => {
    const trend = vo2Trend(
      [run('2026-10-20'), run('2026-10-27'), run('2026-11-10', { movingS: 2800 }), run('2026-11-17')],
      192,
    );
    const p = predictionTrend(trend, 14, '2026-11-22');
    const last = p.at(-1)!;
    expect(last.vdot).toBeCloseTo(vo2At(trend, '2026-11-22')!, 5);
    expect(last.t10k).toBeCloseTo(predictTime(last.vdot!, 10000), 5);
    expect(last.tHalf!).toBeGreaterThan(last.t10k!);
    // Con una carrera más rápida la previsión cambia de una semana a otra (no queda plana)
    const vdots = p.map((x) => x.vdot).filter((x) => x !== undefined);
    expect(new Set(vdots.map((x) => x!.toFixed(3))).size).toBeGreaterThan(1);
    // Antes de tener dos estimaciones no hay pronóstico
    expect(p[0].vdot).toBeUndefined();
  });

  it('sin estimaciones en los 28 días anteriores, no hay pronóstico', () => {
    const trend = vo2Trend([run('2026-08-01'), run('2026-08-05')], 192);
    expect(predictionTrend(trend, 2, '2026-11-22').every((x) => x.vdot === undefined)).toBe(true);
  });
});

describe('competiciones', () => {
  it('tiempo total con pausas si lo hay', () => {
    expect(raceTime({ elapsedS: 3100, durationS: 3000 })).toBe(3100);
    expect(raceTime({ durationS: 3000 })).toBe(3000);
  });

  it('VDOT de la carrera frente a la forma estimada de ese momento', () => {
    const trend = vo2Trend([run('2026-10-01'), run('2026-10-10')], 192);
    const race = run('2026-10-12', { distanceKm: 10, elapsedS: 2643 });
    const a = analyzeRace(race, trend);
    expect(a.raceVdot).toBeCloseTo(vdot(10000, 2643), 5);
    expect(a.shape).toBeCloseTo(trend[1].avg28!, 5);
    expect(a.diff).toBeCloseTo(a.raceVdot! - a.shape!, 5);
    expect(analyzeRace(run('2026-10-12', { typeKey: 'cycling' }), trend).raceVdot).toBeUndefined();
    expect(analyzeRace(run('2026-10-12', { typeKey: 'trail_running' }), trend).raceVdot).toBeUndefined();
  });
});
