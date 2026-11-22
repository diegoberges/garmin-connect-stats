import { describe, expect, it } from 'vitest';
import { bestEfforts, dailyLoad, edwardsTrimp, formZone, pmc, sessionLoad, weeklyChange, weeklyLoad } from './load';
import type { Activity } from './garmin/types';

const act = (date: string, over: Partial<Activity> = {}): Activity => ({
  id: 1,
  name: 'x',
  typeKey: 'running',
  startLocal: `${date} 08:00:00`,
  date,
  distanceKm: 10,
  durationS: 3000,
  movingS: 3000,
  hrZonesS: [600, 1200, 600, 600, 0],
  bestEfforts: {},
  isPr: false,
  ...over,
});

describe('carga por sesión', () => {
  it('usa la carga de Garmin y si falta, TRIMP de Edwards', () => {
    expect(sessionLoad(act('2026-11-02', { trainingLoad: 80 }))).toBe(80);
    // 10·1 + 20·2 + 10·3 + 10·4 = 120
    expect(edwardsTrimp([600, 1200, 600, 600, 0])).toBe(120);
    expect(sessionLoad(act('2026-11-02'))).toBe(120);
  });
  it('suma por día y rellena con ceros', () => {
    const d = dailyLoad(
      [act('2026-11-02', { trainingLoad: 50 }), act('2026-11-02', { trainingLoad: 30 })],
      '2026-11-01',
      '2026-11-03',
    );
    expect(d.map((x) => x.load)).toEqual([0, 80, 0]);
  });
});

describe('pmc', () => {
  it('con carga constante la forma física converge y la forma tiende a 0', () => {
    const days = Array.from({ length: 400 }, (_, i) => ({ date: `d${i}`, load: 100 }));
    const last = pmc(days).at(-1)!;
    expect(last.fitness).toBeCloseTo(100, 0);
    expect(last.fatigue).toBeCloseTo(100, 5);
    expect(Math.abs(last.formPct!)).toBeLessThan(1);
  });
  it('tras un bloque duro la forma es negativa y tras descansar positiva', () => {
    const block = [...Array(60).fill(60), ...Array(14).fill(150)].map((load, i) => ({ date: `d${i}`, load }));
    expect(pmc(block).at(-1)!.form).toBeLessThan(0);
    const rest = [
      ...block,
      ...Array(10)
        .fill(0)
        .map((load, i) => ({ date: `r${i}`, load })),
    ];
    expect(pmc(rest).at(-1)!.form).toBeGreaterThan(0);
  });
  it('no da forma en % hasta tener 42 días desde la primera carga', () => {
    const days = Array.from({ length: 50 }, (_, i) => ({ date: `d${i}`, load: i < 5 ? 0 : 50 }));
    const p = pmc(days);
    expect(p[45].formPct).toBeUndefined();
    expect(p[47].formPct).toBeDefined();
  });
  it('zonas de forma', () => {
    expect(formZone(-20).zone).toBe('optimal');
    expect(formZone(-40).zone).toBe('risk');
    expect(formZone(0).zone).toBe('neutral');
    expect(formZone(10).zone).toBe('fresh');
  });
});

describe('semanas', () => {
  it('agrupa carga, intensidad y días de fuerza; compara con la media de 4 semanas', () => {
    const acts = [
      ...['2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02'].map((d) => act(d, { trainingLoad: 100 })),
      act('2026-11-09', { trainingLoad: 150 }),
      act('2026-11-10', { typeKey: 'strength_training', trainingLoad: 20, hrZonesS: [0, 0, 0, 0, 0] }),
      act('2026-11-10', { typeKey: 'strength_training', trainingLoad: 10, hrZonesS: [0, 0, 0, 0, 0] }),
    ];
    const w = weeklyLoad(acts, 7, '2026-11-18');
    const nov9 = w.find((x) => x.week === '2026-11-09')!;
    expect(nov9.total).toBe(180);
    expect(nov9.strengthDays).toBe(1);
    expect(nov9.low).toBe(1800);
    const ch = weeklyChange(w)!;
    expect(ch.avg4).toBe(100);
    expect(ch.pct).toBe(80);
  });
});

describe('bestEfforts', () => {
  it('se queda con el mejor tiempo de cada distancia', () => {
    const b = bestEfforts([
      act('2026-11-01', { id: 1, bestEfforts: { 1000: 300, 5000: 1600 } }),
      act('2026-11-08', { id: 2, bestEfforts: { 1000: 290 } }),
    ]);
    expect(b.map((x) => [x.distance, x.timeS, x.activityId])).toEqual([
      [1000, 290, 2],
      [5000, 1600, 1],
    ]);
  });
});
