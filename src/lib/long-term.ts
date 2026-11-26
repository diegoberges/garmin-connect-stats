/**
 * Salud a largo plazo:
 *  - Regularidad del sueño (últimos 30 días): desviación típica de la hora de acostarse y de levantarse y
 *    jet lag social (diferencia del punto medio del sueño entre noches libres —las que acaban en sábado o
 *    domingo— y laborables). Umbrales orientativos: < 30 min regular, 30–60 algo irregular, > 60 irregular;
 *    jet lag social > 1 h se asocia a peor salud metabólica (Roenneberg). El Sleep Regularity Index necesita
 *    el sueño minuto a minuto, que no da la API.
 *  - FC en reposo y VFC a 12 meses: medias semanales (la VFC, geométrica) y cambio entre el primer y el
 *    último trimestre.
 *  - IMC con el peso y la altura del perfil (Garmin no da la altura). En deportistas con mucha masa
 *    muscular sobrestima la grasa: orientativo.
 */
import { addDays, weekStart } from './dates';
import type { DayHealth } from './garmin/types';

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
};

/** Minutos desde las 12:00 de una marca "local" en epoch ms (Garmin da la hora local como si fuera UTC). */
export function minutesFromNoon(epochLocalMs: number): number {
  const d = new Date(epochLocalMs);
  return (d.getUTCHours() * 60 + d.getUTCMinutes() + 720) % 1440;
}

export interface SleepNight {
  date: string;
  /** minutos desde las 12:00 (acostarse y levantarse) */
  bed: number;
  wake: number;
}

export interface SleepRegularity {
  nights: SleepNight[];
  /** minutos */
  sdBed: number;
  sdWake: number;
  meanBed: number;
  meanWake: number;
  /** minutos; undefined si no hay noches libres y laborables suficientes */
  socialJetlag?: number;
  label: 'Regular' | 'Algo irregular' | 'Irregular';
}

const MIN_NIGHTS = 10;

/** Noches con hora de acostarse y de levantarse de los `days` días que acaban en `today`. */
export function sleepNights(health: DayHealth[], today: string, days = 30): SleepNight[] {
  const from = addDays(today, -(days - 1));
  return health
    .filter((d) => d.date >= from && d.date <= today && d.sleepStartLocal && d.sleepEndLocal)
    .map((d) => {
      const bed = minutesFromNoon(d.sleepStartLocal!);
      let wake = minutesFromNoon(d.sleepEndLocal!);
      // Levantarse "antes" de acostarse en la escala desde mediodía: pasó de las 12:00 del día siguiente
      if (wake < bed) wake += 1440;
      return { date: d.date, bed, wake };
    });
}

export function sleepRegularity(health: DayHealth[], today: string): SleepRegularity | undefined {
  const nights = sleepNights(health, today);
  if (nights.length < MIN_NIGHTS) return undefined;
  const sdBed = sd(nights.map((n) => n.bed));
  const sdWake = sd(nights.map((n) => n.wake));
  const mid = (n: SleepNight) => (n.bed + n.wake) / 2;
  // Noche libre: la que acaba en sábado o domingo (te levantas sin trabajar al día siguiente... o casi)
  const isFree = (n: SleepNight) => [0, 6].includes(new Date(`${n.date}T12:00:00Z`).getUTCDay());
  const free = nights.filter(isFree).map(mid);
  const work = nights.filter((n) => !isFree(n)).map(mid);
  const worst = Math.max(sdBed, sdWake);
  let label: SleepRegularity['label'] = 'Irregular';
  if (worst < 30) label = 'Regular';
  else if (worst <= 60) label = 'Algo irregular';
  return {
    nights,
    sdBed,
    sdWake,
    meanBed: mean(nights.map((n) => n.bed)),
    meanWake: mean(nights.map((n) => n.wake)),
    socialJetlag: free.length >= 2 && work.length >= 3 ? Math.abs(mean(free) - mean(work)) : undefined,
    label,
  };
}

export interface WeekValue {
  week: string;
  value?: number;
  days: number;
}

/** Media semanal (lunes–domingo) de las `weeks` semanas que acaban en la de `today`; `geometric` para la VFC. */
export function weeklyMean(
  health: DayHealth[],
  pick: (d: DayHealth) => number | undefined,
  weeks: number,
  today: string,
  geometric = false,
): WeekValue[] {
  const current = weekStart(today);
  const byWeek = new Map<string, number[]>();
  for (let i = weeks - 1; i >= 0; i--) byWeek.set(addDays(current, -7 * i), []);
  for (const d of health) {
    const v = pick(d);
    const w = byWeek.get(weekStart(d.date));
    if (w && v !== undefined && Number.isFinite(v) && v > 0) w.push(geometric ? Math.log(v) : v);
  }
  return [...byWeek.entries()].map(([week, xs]) => {
    if (!xs.length) return { week, days: 0 };
    const m = mean(xs);
    return { week, value: geometric ? Math.exp(m) : m, days: xs.length };
  });
}

/** Cambio entre la media del primer y del último trimestre (13 semanas) con datos. */
export function quarterChange(weeks: WeekValue[]): { first: number; last: number; diff: number } | undefined {
  const avg = (ws: WeekValue[]) => {
    const xs = ws.filter((w) => w.value !== undefined).map((w) => w.value!);
    return xs.length >= 4 ? mean(xs) : undefined;
  };
  const first = avg(weeks.slice(0, 13));
  const last = avg(weeks.slice(-13));
  return first !== undefined && last !== undefined ? { first, last, diff: last - first } : undefined;
}

export const bmi = (kg: number, heightCm: number) => kg / (heightCm / 100) ** 2;

/** Categorías de la OMS (adultos). */
export function bmiCategory(value: number): string {
  if (value < 18.5) return 'Bajo peso';
  if (value < 25) return 'Normal';
  if (value < 30) return 'Sobrepeso';
  return 'Obesidad';
}
