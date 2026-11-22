import { describe, expect, it } from 'vitest';
import { cumulative, monthlyTotals, yearSummary, yearToDate } from './compare';
import type { Activity } from './garmin/types';

const a = (date: string, km: number, movingS = 3000, avgHr?: number): Activity =>
  ({ id: 1, name: 'x', typeKey: 'running', startLocal: `${date} 08:00:00`, date, distanceKm: km, durationS: movingS, movingS, avgHr, hrZonesS: [0, 0, 0, 0, 0], bestEfforts: {}, isPr: false }) as Activity;

const acts = [a('2025-01-10', 10), a('2025-01-20', 5), a('2025-03-01', 21, 7200, 150), a('2026-01-05', 8), a('2026-11-30', 12)];

describe('comparador', () => {
  it('totales por mes del año pedido', () => {
    const m = monthlyTotals(acts, 2025);
    expect(m[0]).toEqual({ km: 15, movingS: 6000, sessions: 2 });
    expect(m[2].km).toBe(21);
    expect(m[1].sessions).toBe(0);
  });
  it('acumulado con meses futuros a null', () => {
    expect(cumulative([1, 2, 3, 4], 3)).toEqual([1, 3, 6, null]);
  });
  it('resumen anual con mejor mes y FC ponderada', () => {
    const s = yearSummary(acts, 2025, true);
    expect(s.sessions).toBe(3);
    expect(s.km).toBe(36);
    expect(s.bestMonth).toBe(2);
    expect(s.avgHr).toBe(150);
  });
  it('año hasta la fecha', () => {
    expect(yearToDate(acts, 2026, '11-22').km).toBe(8);
    expect(yearToDate(acts, 2025, '11-22').km).toBe(36);
  });
});
