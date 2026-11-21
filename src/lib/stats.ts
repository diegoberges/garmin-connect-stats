/** Agregaciones puras sobre los tipos de dominio (sin llamadas a la API). */
import { addDays, weekStart } from './dates';
import type { DayHealth, RunActivity } from './garmin/types';

export interface WeekTotal {
  week: string; // lunes YYYY-MM-DD
  km: number;
  runs: number;
  movingS: number;
}

export interface RunTotals {
  km: number;
  runs: number;
  movingS: number;
  /** ritmo medio ponderado por distancia (s/km) */
  paceSPerKm?: number;
  /** FC media ponderada por tiempo */
  avgHr?: number;
  elevationGainM: number;
}

export function totals(runs: RunActivity[]): RunTotals {
  let km = 0;
  let movingS = 0;
  let elevationGainM = 0;
  let hrWeighted = 0;
  let hrTime = 0;
  for (const r of runs) {
    km += r.distanceKm;
    movingS += r.movingS;
    elevationGainM += r.elevationGainM ?? 0;
    if (r.avgHr) {
      hrWeighted += r.avgHr * r.movingS;
      hrTime += r.movingS;
    }
  }
  return {
    km,
    runs: runs.length,
    movingS,
    paceSPerKm: km > 0 ? movingS / km : undefined,
    avgHr: hrTime > 0 ? hrWeighted / hrTime : undefined,
    elevationGainM,
  };
}

/** Totales por semana (lunes a domingo) para las `weeks` semanas que terminan en la de `today`. */
export function weeklyTotals(runs: RunActivity[], weeks: number, today: string): WeekTotal[] {
  const current = weekStart(today);
  const out: WeekTotal[] = [];
  for (let i = weeks - 1; i >= 0; i--) out.push({ week: addDays(current, -7 * i), km: 0, runs: 0, movingS: 0 });
  const byWeek = new Map(out.map((w) => [w.week, w]));
  for (const r of runs) {
    const w = byWeek.get(weekStart(r.date));
    if (!w) continue;
    w.km += r.distanceKm;
    w.runs += 1;
    w.movingS += r.movingS;
  }
  return out;
}

export function runsBetween(runs: RunActivity[], from: string, to: string): RunActivity[] {
  return runs.filter((r) => r.date >= from && r.date <= to);
}

/** Media de los valores definidos; undefined si no hay ninguno. */
export function mean(values: (number | undefined)[]): number | undefined {
  const xs = values.filter((v): v is number => v !== undefined);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined;
}

export function avgOf<K extends keyof DayHealth>(days: DayHealth[], key: K): number | undefined {
  return mean(days.map((d) => d[key] as number | undefined));
}

/** Variación relativa en % (undefined si no hay base). */
export function pctChange(current?: number, previous?: number): number | undefined {
  if (current === undefined || previous === undefined || previous === 0) return undefined;
  return ((current - previous) / previous) * 100;
}
