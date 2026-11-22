import { describe, expect, it } from 'vitest';
import { addDays, chunkRange, weekStart } from './dates';
import { pace, duration } from './format';
import { pctChange, totals, weeklyTotals } from './stats';
import type { Activity } from './garmin/types';

const run = (date: string, km: number, movingS: number, avgHr?: number): Activity => ({
  id: 1,
  name: 'x',
  typeKey: 'running',
  startLocal: `${date} 08:00:00`,
  date,
  distanceKm: km,
  durationS: movingS,
  movingS,
  avgHr,
  hrZonesS: [0, 0, 0, 0, 0],
});

describe('fechas', () => {
  it('weekStart devuelve el lunes', () => {
    expect(weekStart('2026-11-21')).toBe('2026-11-16'); // sábado → lunes
    expect(weekStart('2026-11-16')).toBe('2026-11-16');
    expect(weekStart('2026-11-22')).toBe('2026-11-16'); // domingo
  });
  it('addDays cruza meses y cambio de hora', () => {
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('chunkRange cubre el rango sin solapes', () => {
    expect(chunkRange('2026-01-01', '2026-01-10', 4)).toEqual([
      ['2026-01-01', '2026-01-04'],
      ['2026-01-05', '2026-01-08'],
      ['2026-01-09', '2026-01-10'],
    ]);
  });
});

describe('agregaciones', () => {
  it('ritmo ponderado por distancia y FC por tiempo', () => {
    const t = totals([run('2026-11-16', 10, 3000, 150), run('2026-11-18', 5, 1800, 160)]);
    expect(t.km).toBe(15);
    expect(t.paceSPerKm).toBeCloseTo(320); // 4800 s / 15 km
    expect(t.avgHr).toBeCloseTo((150 * 3000 + 160 * 1800) / 4800);
  });
  it('totales semanales incluyen semanas vacías', () => {
    const w = weeklyTotals([run('2026-11-18', 8, 2400), run('2026-11-04', 6, 1800)], 3, '2026-11-21');
    expect(w.map((x) => x.week)).toEqual(['2026-11-02', '2026-11-09', '2026-11-16']);
    expect(w.map((x) => x.km)).toEqual([6, 0, 8]);
  });
  it('pctChange', () => {
    expect(pctChange(12, 10)).toBeCloseTo(20);
    expect(pctChange(5, 0)).toBeUndefined();
  });
});

describe('formato', () => {
  it('ritmo y duración', () => {
    expect(pace(325)).toBe('5:25');
    expect(pace(359.6)).toBe('6:00');
    expect(duration(3725)).toBe('1:02:05');
    expect(duration(1500)).toBe('25:00');
  });
});
