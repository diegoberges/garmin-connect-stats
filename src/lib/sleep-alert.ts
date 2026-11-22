/**
 * Alerta "Fatiga por sueño": avisa cuando la fatiga viene del sueño y no del entrenamiento, algo que
 * ni Garmin ni Runalyze ni TrainingPeaks cruzan (ver el informe de métricas del dashboard).
 *
 *  AVISO   si anoche < `lastNightH` h  Y  noches < `shortNightH` h en los últimos 7 días ≥ `minShortNights`.
 *          Salta aunque la carga sea baja y la VFC y la FC en reposo estén normales.
 *  ALTO    si además la VFC de 7 días < línea base de 60 días − `hrvSd` DE (en ln)
 *          o la FC en reposo de 7 días > mediana de los 30 días previos + `rhrBpm`.
 *
 * Una noche sin dato de sueño no cuenta como corta: se marca "sin dato". Los umbrales son heurísticos
 * y configurables por atleta (menú de perfil); los valores por defecto son los del informe.
 */
import { addDays, dateRange } from './dates';
import type { DayHealth } from './garmin/types';

export interface AlertThresholds {
  /** Objetivo de sueño para la deuda (h). Sin él se usa la necesidad que calcula Garmin y, si falta, 7,5 h. */
  sleepTargetH?: number;
  /** Una noche por debajo de esto es "corta" (h). */
  shortNightH: number;
  /** Anoche por debajo de esto dispara la alerta (h). */
  lastNightH: number;
  /** Noches cortas mínimas en 7 días. */
  minShortNights: number;
  /** Desviaciones típicas por debajo de la línea base de VFC para escalar. */
  hrvSd: number;
  /** Pulsaciones por encima de la línea base de FC en reposo para escalar. */
  rhrBpm: number;
}

export const DEFAULT_THRESHOLDS: AlertThresholds = {
  shortNightH: 6.5,
  lastNightH: 6,
  minShortNights: 2,
  hrvSd: 1,
  rhrBpm: 5,
};

/** Límites de los campos del formulario (también se usan para validar lo que llega). */
export const THRESHOLD_LIMITS: Record<keyof AlertThresholds, { min: number; max: number; step: number }> = {
  sleepTargetH: { min: 5, max: 10, step: 0.25 },
  shortNightH: { min: 4, max: 9, step: 0.25 },
  lastNightH: { min: 3, max: 9, step: 0.25 },
  minShortNights: { min: 1, max: 7, step: 1 },
  hrvSd: { min: 0.5, max: 2, step: 0.25 },
  rhrBpm: { min: 2, max: 15, step: 1 },
};

const FALLBACK_TARGET_S = 7.5 * 3600;
const WEEK = 7;
const HRV_BASE_DAYS = 60;
const HRV_MIN_NIGHTS = 21;
const RHR_BASE_DAYS = 30;
const RHR_MIN_DAYS = 14;
/** Mínimo de valores en la ventana de 7 días para hablar de una media semanal. */
const WEEK_MIN = 3;

export type AlertLevel = 'warning' | 'high';

export interface SleepFatigueAlert {
  date: string;
  level: AlertLevel;
  lastNightS: number;
  deepS?: number;
  remS?: number;
  /** Noches cortas y noches con dato en los 7 días que terminan en `date`. */
  shortNights: number;
  nightsWithData: number;
  /** Deuda de 7 días: Σ(objetivo − dormido), sin bajar de 0. */
  debtS: number;
  /** Escalado por VFC baja: media de 7 días y límite inferior (ms). */
  hrv?: { avg7: number; limit: number };
  /** Escalado por FC en reposo alta: media de 7 días y línea base (ppm). */
  rhr?: { avg7: number; base: number };
}

const defined = (xs: (number | undefined)[]) => xs.filter((x): x is number => x !== undefined && Number.isFinite(x));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1));
};
const median = (xs: number[]) => {
  const s = xs.toSorted((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/** Valores de `pick` en los días [from, to] (los que falten, undefined). */
function window(byDate: Map<string, DayHealth>, from: string, to: string, pick: (d: DayHealth) => number | undefined) {
  return dateRange(from, to).map((d) => {
    const day = byDate.get(d);
    return day ? pick(day) : undefined;
  });
}

/** Deuda de sueño de los 7 días que terminan en `date`. */
export function weeklySleepDebt(byDate: Map<string, DayHealth>, date: string, t: AlertThresholds): number {
  let debt = 0;
  for (const d of dateRange(addDays(date, -(WEEK - 1)), date)) {
    const day = byDate.get(d);
    if (day?.sleepS === undefined) continue;
    const target = t.sleepTargetH !== undefined ? t.sleepTargetH * 3600 : (day.sleepNeedS ?? FALLBACK_TARGET_S);
    debt += target - day.sleepS;
  }
  return Math.max(0, debt);
}

/** VFC de 7 días por debajo de la línea base de los 60 días anteriores − k·DE (en ln). */
function hrvEscalation(byDate: Map<string, DayHealth>, date: string, k: number) {
  const ln = (d: DayHealth) => (d.hrvLastNight && d.hrvLastNight > 0 ? Math.log(d.hrvLastNight) : undefined);
  const weekStart = addDays(date, -(WEEK - 1));
  const week = defined(window(byDate, weekStart, date, ln));
  const base = defined(window(byDate, addDays(weekStart, -HRV_BASE_DAYS), addDays(weekStart, -1), ln));
  if (week.length < WEEK_MIN || base.length < HRV_MIN_NIGHTS) return undefined;
  const avg7 = mean(week);
  const limit = mean(base) - k * sd(base);
  return avg7 < limit ? { avg7: Math.exp(avg7), limit: Math.exp(limit) } : undefined;
}

/** FC en reposo de 7 días por encima de la mediana de los 30 días anteriores + `bpm`. */
function rhrEscalation(byDate: Map<string, DayHealth>, date: string, bpm: number) {
  const weekStart = addDays(date, -(WEEK - 1));
  const week = defined(window(byDate, weekStart, date, (d) => d.restingHr));
  const base = defined(window(byDate, addDays(weekStart, -RHR_BASE_DAYS), addDays(weekStart, -1), (d) => d.restingHr));
  if (week.length < WEEK_MIN || base.length < RHR_MIN_DAYS) return undefined;
  const avg7 = mean(week);
  const b = median(base);
  return avg7 > b + bpm ? { avg7, base: b } : undefined;
}

export const indexByDate = (days: DayHealth[]) => new Map(days.map((d) => [d.date, d]));

/**
 * Evalúa la regla para el día `date` (el sueño de Garmin va con la fecha en que te despiertas).
 * Devuelve `undefined` si no salta o si falta el dato de anoche.
 */
export function evaluateSleepFatigue(
  byDate: Map<string, DayHealth>,
  date: string,
  t: AlertThresholds = DEFAULT_THRESHOLDS,
): SleepFatigueAlert | undefined {
  const last = byDate.get(date);
  if (last?.sleepS === undefined) return undefined;
  if (last.sleepS >= t.lastNightH * 3600) return undefined;

  const nights = defined(window(byDate, addDays(date, -(WEEK - 1)), date, (d) => d.sleepS));
  const shortNights = nights.filter((s) => s < t.shortNightH * 3600).length;
  if (shortNights < t.minShortNights) return undefined;

  const hrv = hrvEscalation(byDate, date, t.hrvSd);
  const rhr = rhrEscalation(byDate, date, t.rhrBpm);
  return {
    date,
    level: hrv || rhr ? 'high' : 'warning',
    lastNightS: last.sleepS,
    deepS: last.deepS,
    remS: last.remS,
    shortNights,
    nightsWithData: nights.length,
    debtS: weeklySleepDebt(byDate, date, t),
    hrv,
    rhr,
  };
}

/** Alerta de hoy; si la noche de hoy aún no se ha sincronizado, la de ayer (indicando la fecha). */
export function currentAlert(days: DayHealth[], today: string, t: AlertThresholds = DEFAULT_THRESHOLDS) {
  const byDate = indexByDate(days);
  const date = byDate.get(today)?.sleepS === undefined ? addDays(today, -1) : today;
  return { date, alert: evaluateSleepFatigue(byDate, date, t), missing: byDate.get(date)?.sleepS === undefined };
}

/** Histórico: la regla evaluada cada día de [from, to] (sustituye a la tabla DailyAlert del informe). */
export function alertHistory(
  days: DayHealth[],
  from: string,
  to: string,
  t: AlertThresholds = DEFAULT_THRESHOLDS,
): SleepFatigueAlert[] {
  const byDate = indexByDate(days);
  return dateRange(from, to)
    .map((d) => evaluateSleepFatigue(byDate, d, t))
    .filter((a): a is SleepFatigueAlert => a !== undefined);
}

/** Une los umbrales guardados con los de por defecto, descartando valores fuera de rango. */
export function resolveThresholds(saved?: Partial<AlertThresholds>): AlertThresholds {
  const out: AlertThresholds = { ...DEFAULT_THRESHOLDS };
  for (const key of Object.keys(THRESHOLD_LIMITS) as (keyof AlertThresholds)[]) {
    const v = saved?.[key];
    const { min, max } = THRESHOLD_LIMITS[key];
    if (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max) out[key] = v;
  }
  return out;
}
