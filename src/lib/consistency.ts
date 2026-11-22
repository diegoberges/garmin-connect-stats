/**
 * Constancia (P3 del informe del dashboard, elementos motivacionales sencillos):
 *  - Número de Eddington de carrera: el mayor E tal que has corrido al menos E km en E días distintos.
 *  - Rachas: días seguidos con alguna actividad y semanas seguidas corriendo (actual y la más larga).
 *  - Calendario anual: minutos de actividad por día y competiciones.
 */
import { addDays, dateRange, weekStart } from './dates';
import type { Activity } from './garmin/types';

const isRun = (a: Activity) => /run/.test(a.typeKey);

/** Km de carrera por día. */
function runKmByDay(activities: Activity[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const a of activities) if (isRun(a)) out.set(a.date, (out.get(a.date) ?? 0) + a.distanceKm);
  return out;
}

export interface Eddington {
  value: number;
  /** Días que faltan con al menos `value + 1` km para subir al siguiente. */
  toNext: number;
}

export function eddington(activities: Activity[]): Eddington {
  const days = [...runKmByDay(activities).values()].sort((a, b) => b - a);
  let e = 0;
  while (e < days.length && days[e] >= e + 1) e++;
  const next = e + 1;
  return { value: e, toNext: next - days.filter((k) => k >= next).length };
}

export interface Streak {
  length: number;
  /** Fecha (día o lunes de la semana) en que empieza y termina. */
  from?: string;
  to?: string;
}
export interface Streaks {
  /** Días seguidos con alguna actividad que llegan a hoy (o a ayer, si hoy aún no has entrenado). */
  currentDays: Streak;
  longestDays: Streak;
  /** Semanas (lunes–domingo) seguidas con al menos una carrera; la actual cuenta si ya hay alguna. */
  currentWeeks: Streak;
  longestWeeks: Streak;
}

/** Racha más larga sobre una lista ordenada de pasos (días o semanas). */
function longestRun(steps: string[], has: Set<string>): Streak {
  let longest: Streak = { length: 0 };
  let cur: Streak = { length: 0 };
  for (const s of steps) {
    if (!has.has(s)) {
      cur = { length: 0 };
      continue;
    }
    cur = { length: cur.length + 1, from: cur.length ? cur.from : s, to: s };
    if (cur.length > longest.length) longest = cur;
  }
  return longest;
}

/** Racha que termina en `end`, o en el paso anterior si `end` aún no cuenta (hoy sin entrenar). */
function currentRun(has: Set<string>, end: string, prevOf: (s: string) => string): Streak {
  const stop = has.has(end) ? end : prevOf(end);
  let length = 0;
  let from = stop;
  for (let s = stop; has.has(s); s = prevOf(s)) {
    length++;
    from = s;
  }
  return length ? { length, from, to: stop } : { length: 0 };
}

export function streaks(activities: Activity[], today: string): Streaks {
  if (!activities.length) {
    const none = { length: 0 };
    return { currentDays: none, longestDays: none, currentWeeks: none, longestWeeks: none };
  }
  // Primera fecha (texto ISO: el orden alfabético es el cronológico)
  const first = activities.map((a) => a.date).toSorted((a, b) => a.localeCompare(b))[0];
  const activeDays = new Set(activities.map((a) => a.date));
  const prevDay = (s: string) => addDays(s, -1);

  const runWeeks = new Set(activities.filter(isRun).map((a) => weekStart(a.date)));
  const weeks: string[] = [];
  for (let w = weekStart(first); w <= weekStart(today); w = addDays(w, 7)) weeks.push(w);
  const prevWeek = (s: string) => addDays(s, -7);
  return {
    currentDays: currentRun(activeDays, today, prevDay),
    longestDays: longestRun(dateRange(first, today), activeDays),
    currentWeeks: currentRun(runWeeks, weekStart(today), prevWeek),
    longestWeeks: longestRun(weeks, runWeeks),
  };
}

export interface CalendarDay {
  date: string;
  minutes: number;
  race: boolean;
}

/** Un año, día a día: minutos de actividad y si hubo competición. */
export function yearCalendar(activities: Activity[], year: number, races: Set<number>): CalendarDay[] {
  const byDay = new Map<string, CalendarDay>();
  for (const date of dateRange(`${year}-01-01`, `${year}-12-31`)) byDay.set(date, { date, minutes: 0, race: false });
  for (const a of activities) {
    const day = byDay.get(a.date);
    if (!day) continue;
    day.minutes += a.movingS / 60;
    if (races.has(a.id)) day.race = true;
  }
  return [...byDay.values()];
}
