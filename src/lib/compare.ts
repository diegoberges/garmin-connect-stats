/**
 * Comparación entre años: totales por mes, acumulado y resumen anual de un conjunto de actividades.
 * Funciones puras sobre actividades ya filtradas por tipo.
 */
import type { Activity } from './garmin/types';

export const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];

export interface MonthTotal {
  km: number;
  movingS: number;
  sessions: number;
}

/** 12 meses del año con km, tiempo y sesiones. */
export function monthlyTotals(activities: Activity[], year: number): MonthTotal[] {
  const out = Array.from({ length: 12 }, () => ({ km: 0, movingS: 0, sessions: 0 }));
  for (const a of activities) {
    if (Number(a.date.slice(0, 4)) !== year) continue;
    const m = out[Number(a.date.slice(5, 7)) - 1];
    m.km += a.distanceKm;
    m.movingS += a.movingS;
    m.sessions += 1;
  }
  return out;
}

/** Acumulado mes a mes; los meses futuros del año en curso quedan en null para no pintar una línea plana. */
export function cumulative(values: number[], lastMonth = 12): (number | null)[] {
  let acc = 0;
  return values.map((v, i) => {
    if (i >= lastMonth) return null;
    acc += v;
    return acc;
  });
}

export interface YearSummary {
  year: number;
  sessions: number;
  km: number;
  movingS: number;
  elevationGainM: number;
  /** FC media ponderada por tiempo */
  avgHr?: number;
  /** mes con más volumen (0–11) según la métrica principal */
  bestMonth?: number;
}

export function yearSummary(activities: Activity[], year: number, byDistance: boolean): YearSummary {
  const inYear = activities.filter((a) => Number(a.date.slice(0, 4)) === year);
  let hrW = 0;
  let hrT = 0;
  for (const a of inYear)
    if (a.avgHr) {
      hrW += a.avgHr * a.movingS;
      hrT += a.movingS;
    }
  const months = monthlyTotals(inYear, year);
  const metric = months.map((m) => (byDistance ? m.km : m.movingS));
  const max = Math.max(...metric);
  return {
    year,
    sessions: inYear.length,
    km: inYear.reduce((s, a) => s + a.distanceKm, 0),
    movingS: inYear.reduce((s, a) => s + a.movingS, 0),
    elevationGainM: inYear.reduce((s, a) => s + (a.elevationGainM ?? 0), 0),
    avgHr: hrT ? hrW / hrT : undefined,
    bestMonth: max > 0 ? metric.indexOf(max) : undefined,
  };
}

/** Totales desde el 1 de enero hasta el mismo día/mes (`mmdd` = "MM-DD") de cada año. */
export function yearToDate(activities: Activity[], year: number, mmdd: string): MonthTotal {
  const end = `${year}-${mmdd}`;
  const start = `${year}-01-01`;
  const sel = activities.filter((a) => a.date >= start && a.date <= end);
  return {
    km: sel.reduce((s, a) => s + a.distanceKm, 0),
    movingS: sel.reduce((s, a) => s + a.movingS, 0),
    sessions: sel.length,
  };
}
