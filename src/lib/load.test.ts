import { describe, expect, it } from 'vitest';
import {
  acwr,
  acwrZone,
  banisterTrimp,
  bestEfforts,
  dailyLoad,
  estimateHrParams,
  formZone,
  type HrParams,
  monotonyStrain,
  pmc,
  todayModel,
  TODAY_WINDOW_DAYS,
  WARMUP_DAYS,
  rampRate,
  sessionLoad,
  weeklyChange,
  weeklyLoad,
} from './load';
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

const HR: HrParams = { restingHr: 43, maxHr: 192 };

describe('carga por sesión (TRIMP de Banister)', () => {
  it('min × HRr × 0,64 × e^(1,92 × HRr) en hombres y 0,86/1,67 en mujeres', () => {
    // HRr = (150 − 43) / (192 − 43) = 0,718
    expect(banisterTrimp(60, 150, HR)).toBeCloseTo(109.47, 1);
    expect(banisterTrimp(60, 150, { ...HR, sex: 'female' })).toBeCloseTo(122.94, 1);
  });
  it('limita la reserva de FC entre 0 y 1 y descarta parámetros sin sentido', () => {
    expect(banisterTrimp(30, 200, HR)).toBeCloseTo(30 * 0.64 * Math.exp(1.92), 5);
    expect(banisterTrimp(30, 40, HR)).toBe(0);
    expect(banisterTrimp(30, 150, { restingHr: 60, maxHr: 60 })).toBe(0);
  });
  it('usa la FC media y el tiempo en movimiento; sin FC no suma', () => {
    expect(sessionLoad(act('2026-11-02', { avgHr: 150, movingS: 3600 }), HR)).toBeCloseTo(109.47, 1);
    expect(sessionLoad(act('2026-11-02', { avgHr: undefined, trainingLoad: 80 }), HR)).toBe(0);
  });
  it('sin FC de referencia de Garmin, estima con la máxima registrada', () => {
    expect(estimateHrParams([{ maxHr: 181 }, { maxHr: 188 }, {}])).toEqual({ restingHr: 60, maxHr: 188 });
    expect(estimateHrParams([{ maxHr: 120 }])).toEqual({ restingHr: 60, maxHr: 190 });
  });
  it('suma por día y rellena con ceros', () => {
    const one = sessionLoad(act('2026-11-02', { avgHr: 150 }), HR);
    const d = dailyLoad(
      [act('2026-11-02', { avgHr: 150 }), act('2026-11-02', { avgHr: 150 })],
      '2026-11-01',
      '2026-11-03',
      HR,
    );
    expect(d.map((x) => x.load)).toEqual([0, 2 * one, 0]);
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
    const base = { avgHr: 150, movingS: 3600 };
    const acts = [
      ...['2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02'].map((d) => act(d, base)),
      act('2026-11-09', { ...base, movingS: 5400 }),
      act('2026-11-10', { typeKey: 'strength_training', hrZonesS: [0, 0, 0, 0, 0] }),
      act('2026-11-10', { typeKey: 'strength_training', hrZonesS: [0, 0, 0, 0, 0] }),
    ];
    const w = weeklyLoad(acts, 7, '2026-11-18', HR);
    const one = sessionLoad(act('2026-11-02', base), HR);
    const nov9 = w.find((x) => x.week === '2026-11-09')!;
    expect(nov9.total).toBeCloseTo(1.5 * one, 5);
    expect(nov9.strengthDays).toBe(1);
    expect(nov9.low).toBe(1800);
    const ch = weeklyChange(w)!;
    expect(ch.avg4).toBeCloseTo(one, 5);
    expect(ch.pct).toBeCloseTo(50, 5);
  });
});

describe('rampa, monotonía y strain', () => {
  it('rampa = forma física de hoy − la de hace 7 días (solo con 42 días de historial)', () => {
    const days = Array.from({ length: 80 }, (_, i) => ({ date: `d${i}`, load: i < 70 ? 50 : 150 }));
    const p = pmc(days);
    expect(rampRate(p)).toBeCloseTo(p.at(-1)!.fitness - p.at(-8)!.fitness, 5);
    expect(rampRate(p)).toBeGreaterThan(0);
    expect(rampRate(pmc(days.slice(0, 20)))).toBeUndefined();
  });
  it('monotonía = media / DE y strain = carga semanal × monotonía (Foster)', () => {
    const week = [100, 0, 100, 0, 100, 0, 100].map((load) => ({ load }));
    const m = monotonyStrain(week)!;
    // media 57,14; DE 49,49 → 1,155
    expect(m.monotony).toBeCloseTo(1.155, 2);
    expect(m.strain).toBeCloseTo(400 * 1.155, 0);
    expect(monotonyStrain(Array(7).fill({ load: 50 }))).toBeUndefined();
    expect(monotonyStrain(Array(6).fill({ load: 50 }))).toBeUndefined();
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

describe('ratio agudo:crónico', () => {
  it('fatiga / forma física, con bandas del informe', () => {
    expect(acwr({ fitness: 57, fatigue: 41 })).toBeCloseTo(0.72, 2);
    expect(acwrZone(0.72).zone).toBe('low');
    expect(acwrZone(0.8).zone).toBe('optimal');
    expect(acwrZone(1.4).zone).toBe('elevated');
    expect(acwrZone(1.6).zone).toBe('risk');
    expect(acwr({ fitness: 0.2, fatigue: 3 })).toBeUndefined();
  });
});

describe('cifras de hoy con ventana fija', () => {
  // Una carrera cada 3 días durante ~2 años
  const today = '2026-11-27';
  const acts = Array.from({ length: 240 }, (_, i) => {
    const d = new Date(Date.parse(`${today}T12:00:00Z`) - i * 3 * 86_400_000).toISOString().slice(0, 10);
    return act(d, { avgHr: 150 });
  });

  it('no dependen de cuánto historial anterior a la ventana se le pase', () => {
    const start = new Date(Date.parse(`${today}T12:00:00Z`) - (TODAY_WINDOW_DAYS + WARMUP_DAYS) * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const all = todayModel(acts, today, HR).at(-1)!;
    const recent = todayModel(
      acts.filter((a) => a.date >= start),
      today,
      HR,
    ).at(-1)!;
    expect(all.fitness).toBeCloseTo(recent.fitness, 10);
    expect(all.fatigue).toBeCloseTo(recent.fatigue, 10);
    expect(all.date).toBe(today);
  });

  it('cubre un año más el calentamiento', () => {
    expect(todayModel(acts, today, HR)).toHaveLength(TODAY_WINDOW_DAYS + WARMUP_DAYS + 1);
  });
});
