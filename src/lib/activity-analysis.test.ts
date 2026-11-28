import { describe, expect, it } from 'vitest';
import type { Activity } from './garmin/types';
import {
  danielsSpeed,
  haversineM,
  paceZoneBounds,
  routeComparison,
  sameRoute,
  timeInPaceZones,
  vdotForDate,
} from './activity-analysis';
import { vdot } from './efficiency';
import { vo2AtSpeed } from './progression';

const act = (id: number, over: Partial<Activity> = {}): Activity => ({
  id,
  name: 'x',
  typeKey: 'running',
  startLocal: '2026-11-01 08:00:00',
  date: '2026-11-01',
  distanceKm: 10,
  durationS: 3000,
  movingS: 3000,
  hrZonesS: [0, 0, 0, 0, 0],
  bestEfforts: {},
  isPr: false,
  startLat: 41.6488,
  startLon: -0.8891,
  ...over,
});

describe('zonas de ritmo (Daniels)', () => {
  it('la velocidad de Daniels invierte el coste de oxígeno', () => {
    const v = danielsSpeed(50, 0.8); // m/s
    expect(vo2AtSpeed(v * 60)).toBeCloseTo(40, 5);
  });

  it('4 cortes crecientes para 5 zonas', () => {
    const b = paceZoneBounds(45);
    expect(b).toHaveLength(4);
    for (let i = 1; i < b.length; i++) expect(b[i]).toBeGreaterThan(b[i - 1]);
    // VDOT 45: umbral (88 %) hacia 4:30 /km
    expect(1000 / b[2]).toBeGreaterThan(260);
    expect(1000 / b[2]).toBeLessThan(285);
  });

  it('reparte el histograma de tiempo por velocidad entre zonas', () => {
    const bounds = [2, 3, 3.5, 4];
    const hist: number[] = [];
    hist[Math.floor(1.5 / 0.05)] = 100; // Z1
    hist[Math.floor(3.2 / 0.05)] = 50; // Z3
    hist[Math.floor(5 / 0.05)] = 10; // Z5
    expect(timeInPaceZones(hist, 0.05, bounds)).toEqual([100, 0, 50, 0, 10]);
  });

  it('VDOT de la fecha: mejores marcas de los 180 días anteriores, no las posteriores', () => {
    const runs = [
      act(1, { date: '2026-06-01', bestEfforts: { 5000: 1500 } }),
      act(2, { date: '2026-12-01', bestEfforts: { 5000: 1200 } }),
    ];
    expect(vdotForDate(runs, '2026-11-01')).toBeCloseTo(vdot(5000, 1500), 5);
    expect(vdotForDate(runs, '2027-03-01')).toBeCloseTo(vdot(5000, 1200), 5);
    expect(vdotForDate(runs, '2027-08-01')).toBeUndefined();
    expect(vdotForDate(runs, '2026-01-01')).toBeUndefined();
  });
});

describe('misma ruta', () => {
  it('distancia entre dos puntos', () => {
    // 0,001° de latitud ≈ 111 m
    expect(haversineM(41.6488, -0.8891, 41.6498, -0.8891)).toBeCloseTo(111, 0);
  });

  it('mismo deporte, salida a < 250 m y distancia ±5 %, en orden cronológico', () => {
    const target = act(1, { startLocal: '2026-11-10 08:00:00' });
    const acts = [
      target,
      act(2, { startLocal: '2026-10-01 08:00:00', distanceKm: 10.3, startLat: 41.6495 }),
      act(3, { startLocal: '2026-09-01 08:00:00', distanceKm: 12 }), // distancia distinta
      act(4, { startLocal: '2026-08-01 08:00:00', startLat: 41.66 }), // sale a ~1,2 km
      act(5, { startLocal: '2026-07-01 08:00:00', typeKey: 'walking' }), // otro deporte
      act(6, { startLocal: '2026-06-01 08:00:00', typeKey: 'treadmill_running', startLat: undefined }),
    ];
    expect(sameRoute(target, acts).map((a) => a.id)).toEqual([2, 1]);
    expect(sameRoute(act(7, { startLat: undefined }), acts)).toEqual([]);
  });
});

describe('esta vez frente a las anteriores en la misma ruta', () => {
  const at = (id: number, day: string, movingS: number, avgHr: number) =>
    act(id, { startLocal: `${day} 08:00:00`, date: day, movingS, avgHr });
  const pace = (a: Activity) => a.movingS / a.distanceKm;

  it('frente a la vez anterior y a la mediana de las 5 últimas, sin contar las posteriores', () => {
    const target = at(10, '2026-11-20', 2900, 150);
    const matches = [
      at(1, '2026-01-01', 9999, 999), // queda fuera: hay 5 más recientes
      at(2, '2026-03-01', 3600, 152), // una vez rara: la mediana no se mueve por ella
      at(3, '2026-05-01', 3000, 152),
      at(4, '2026-07-01', 3000, 152),
      at(5, '2026-09-01', 3000, 152),
      at(6, '2026-10-01', 2900, 150),
      target,
      at(11, '2026-11-25', 1000, 100), // posterior: no cuenta
    ];
    const c = routeComparison(target, matches, pace)!;
    expect(c.last.date).toBe('2026-10-01');
    expect(c.last.valueDiff).toBeCloseTo(0, 5);
    expect(c.last.hrDiff).toBeCloseTo(0, 5);
    expect(c.usual!.count).toBe(5);
    expect(c.usual!.since).toBe('2026-03-01');
    expect(c.usual!.valueDiff).toBeCloseTo(-10, 5); // 290 frente a la mediana de 300 s/km
    expect(c.usual!.hrDiff).toBeCloseTo(-2, 5);
  });

  it('con una sola vez anterior no hay habitual; sin ninguna, nada', () => {
    const target = at(10, '2026-11-20', 2900, 150);
    const one = routeComparison(target, [at(1, '2026-11-01', 3000, 152), target], pace)!;
    expect(one.usual).toBeUndefined();
    expect(one.last.valueDiff).toBeCloseTo(-10, 5);
    expect(routeComparison(target, [target], pace)).toBeUndefined();
  });
});
