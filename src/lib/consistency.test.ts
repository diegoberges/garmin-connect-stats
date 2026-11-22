import { describe, expect, it } from 'vitest';
import type { Activity } from './garmin/types';
import { eddington, streaks, yearCalendar } from './consistency';
import { dataIssues } from './data-quality';

let nextId = 1;
const act = (date: string, over: Partial<Activity> = {}): Activity => ({
  id: nextId++,
  name: 'x',
  typeKey: 'running',
  startLocal: `${date} 08:00:00`,
  date,
  distanceKm: 10,
  durationS: 3000,
  movingS: 3000,
  avgHr: 150,
  maxHr: 170,
  hrZonesS: [0, 0, 0, 0, 0],
  bestEfforts: {},
  isPr: false,
  ...over,
});

describe('número de Eddington', () => {
  it('mayor E con E días de al menos E km (los km de un mismo día se suman)', () => {
    const acts = [
      act('2026-11-01', { distanceKm: 5 }),
      act('2026-11-01', { distanceKm: 3 }), // 8 km ese día
      act('2026-11-02', { distanceKm: 4 }),
      act('2026-11-03', { distanceKm: 3 }),
      act('2026-11-04', { distanceKm: 2 }),
      act('2026-11-05', { typeKey: 'walking', distanceKm: 20 }), // no es carrera
    ];
    // días: 8, 4, 3, 2 → E = 3 (3 días con ≥ 3 km)
    const e = eddington(acts);
    expect(e.value).toBe(3);
    // para E = 4 hacen falta 4 días con ≥ 4 km: hay 2
    expect(e.toNext).toBe(2);
  });
  it('sin carreras, 0', () => {
    expect(eddington([]).value).toBe(0);
  });
});

describe('rachas', () => {
  it('días seguidos con actividad: la actual cuenta aunque hoy aún no se haya entrenado', () => {
    const acts = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-10', '2026-11-11'].map((d) => act(d));
    const s = streaks(acts, '2026-11-12');
    expect(s.currentDays).toEqual({ length: 2, from: '2026-11-10', to: '2026-11-11' });
    expect(s.longestDays).toEqual({ length: 3, from: '2026-11-01', to: '2026-11-03' });
    expect(streaks(acts, '2026-11-14').currentDays).toHaveLength(0);
  });
  it('semanas seguidas corriendo', () => {
    // Semanas del 2, 9 y 16 de noviembre con carrera; la del 23 todavía no
    const acts = ['2026-11-03', '2026-11-12', '2026-11-20'].map((d) => act(d));
    const s = streaks(acts, '2026-11-24');
    expect(s.currentWeeks).toEqual({ length: 3, from: '2026-11-02', to: '2026-11-16' });
    expect(s.longestWeeks).toHaveLength(3);
  });
});

describe('calendario anual', () => {
  it('minutos por día y competiciones', () => {
    const race = act('2026-11-08', { movingS: 2700 });
    const cal = yearCalendar([race, act('2026-11-08', { movingS: 600 }), act('2025-12-31')], 2026, new Set([race.id]));
    expect(cal).toHaveLength(365);
    const day = cal.find((d) => d.date === '2026-11-08')!;
    expect(day.minutes).toBe(55);
    expect(day.race).toBe(true);
  });
});

describe('calidad de datos', () => {
  it('detecta duplicadas, carreras sin FC, GPS y FC imposibles', () => {
    const a = act('2017-05-28', { startLocal: '2017-05-28 09:00:00', distanceKm: 10.02 });
    const dup = act('2017-05-28', { startLocal: '2017-05-28 09:02:00', distanceKm: 10.05 });
    const otherSport = act('2017-05-28', { startLocal: '2017-05-28 09:01:00', typeKey: 'cycling', distanceKm: 10 });
    const noHr = act('2026-11-01', { avgHr: undefined, maxHr: undefined });
    const fast = act('2026-11-02', { distanceKm: 20, movingS: 2400 }); // 30 km/h corriendo
    const zero = act('2026-11-03', { distanceKm: 0, movingS: 1800, typeKey: 'walking' });
    const treadmill = act('2026-11-03', { distanceKm: 0, movingS: 1800, typeKey: 'treadmill_running' });
    const hr = act('2026-11-04', { maxHr: 240 });
    const issues = dataIssues([a, dup, otherSport, noHr, fast, zero, treadmill, hr]);
    const kinds = issues.map((i) => `${i.kind}:${i.activity.id}`);
    expect(kinds).toContain(`duplicate:${dup.id}`);
    expect(issues.find((i) => i.kind === 'duplicate')!.other!.id).toBe(a.id);
    expect(kinds).not.toContain(`duplicate:${otherSport.id}`);
    expect(kinds).toContain(`no-hr:${noHr.id}`);
    expect(kinds).toContain(`gps:${fast.id}`);
    expect(kinds).toContain(`gps:${zero.id}`);
    expect(kinds).not.toContain(`gps:${treadmill.id}`);
    expect(kinds).toContain(`hr:${hr.id}`);
    // Más recientes primero
    expect(issues[0].activity.date >= issues.at(-1)!.activity.date).toBe(true);
  });
});
