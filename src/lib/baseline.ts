/**
 * Líneas base personales: cada señal diaria se compara contigo mismo, no con valores absolutos.
 * Criterios (ver reports/Métricas de salud y rendimiento.md):
 *  - HRV: media de 7 días de ln(HRV nocturna) frente a una banda de 60 días (μ ± 0,75·σ).
 *    Protocolo de Plews/Altini; el multiplicador 0,75 está en el rango usado (0,5–1) y es heurístico.
 *  - FC en reposo y respiración: diferencia frente a la mediana de los 60 / 30 días previos.
 *  - Deuda de sueño: suma de lo que faltó frente a la necesidad que calcula Garmin, 7 noches.
 * Los umbrales de "fuera de rango" son heurísticos (no validados) y están aquí, en un solo sitio.
 */
import { addDays, weekStart } from './dates';
import type { Activity, DayHealth } from './garmin/types';

export const HRV_WINDOW = 60;
export const HRV_MIN_NIGHTS = 21;
export const HRV_SD_FACTOR = 0.75;
export const RHR_WINDOW = 60;
export const RHR_ALERT_BPM = 5;
export const RESP_WINDOW = 30;
export const RESP_ALERT_RPM = 1.5;
export const SLEEP_DEBT_ALERT_S = 4 * 3600;

const defined = (xs: (number | undefined)[]) => xs.filter((x): x is number => x !== undefined && Number.isFinite(x));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1));
};
export function median(xs: number[]): number | undefined {
  if (!xs.length) return undefined;
  const s = xs.toSorted((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export interface HrvPoint {
  date: string;
  daily?: number;
  /** media geométrica de 7 días (exp de la media de ln) */
  avg7?: number;
  low?: number;
  high?: number;
  /** noches válidas en la ventana de la banda */
  nights: number;
}

/** Serie de HRV con su media de 7 días y la banda de los 60 días anteriores. `days` en orden cronológico. */
export function hrvTrend(days: DayHealth[]): HrvPoint[] {
  const ln = days.map((d) => (d.hrvLastNight && d.hrvLastNight > 0 ? Math.log(d.hrvLastNight) : undefined));
  return days.map((d, i) => {
    const week = defined(ln.slice(Math.max(0, i - 6), i + 1));
    const window = defined(ln.slice(Math.max(0, i - HRV_WINDOW), i));
    const point: HrvPoint = {
      date: d.date,
      daily: d.hrvLastNight,
      avg7: week.length >= 4 ? Math.exp(mean(week)) : undefined,
      nights: window.length,
    };
    if (window.length >= HRV_MIN_NIGHTS) {
      const m = mean(window);
      const s = sd(window) * HRV_SD_FACTOR;
      point.low = Math.exp(m - s);
      point.high = Math.exp(m + s);
    }
    return point;
  });
}

export interface DeltaPoint {
  date: string;
  value?: number;
  /** mediana de la ventana anterior (sin incluir el día) */
  base?: number;
  delta?: number;
}

/** Valor del día frente a la mediana de los `window` días anteriores (mín. 1/3 de la ventana con datos). */
export function deltaTrend(
  days: DayHealth[],
  pick: (d: DayHealth) => number | undefined,
  window: number,
): DeltaPoint[] {
  const vals = days.map(pick);
  return days.map((d, i) => {
    const prev = defined(vals.slice(Math.max(0, i - window), i));
    const base = prev.length >= Math.ceil(window / 3) ? median(prev) : undefined;
    const value = vals[i];
    return { date: d.date, value, base, delta: value !== undefined && base !== undefined ? value - base : undefined };
  });
}

/** Deuda de sueño de las últimas `nights` noches: Σ max(0, necesidad − dormido). */
export function sleepDebt(days: DayHealth[], nights = 7): { debtS: number; nights: number } {
  const recent = days.filter((d) => d.sleepS !== undefined && d.sleepNeedS !== undefined).slice(-nights);
  return {
    debtS: recent.reduce((acc, d) => acc + Math.max(0, d.sleepNeedS! - d.sleepS!), 0),
    nights: recent.length,
  };
}

export type SignalState = 'ok' | 'warn' | 'high' | 'calibrating' | 'nodata';
export interface Signal {
  key: 'hrv' | 'rhr' | 'resp' | 'sleep';
  label: string;
  state: SignalState;
  value: string;
  detail: string;
}
export type DayState = 'normal' | 'attention' | 'alert' | 'calibrating';

/** Último elemento con valor (la noche de hoy puede no haberse sincronizado aún). */
const lastWith = <T>(xs: T[], has: (x: T) => boolean) => xs.findLast(has);

type Fmt = { ms: (v: number) => string; hm: (s: number) => string };

/** Signo de una diferencia, con "±" para el cero. */
function signOf(v: number): string {
  if (v > 0) return '+';
  if (v < 0) return '−';
  return '±';
}

function hrvSignal(days: DayHealth[], fmt: Fmt): Signal {
  const base = { key: 'hrv', label: 'HRV (7 días)' } as const;
  const hrv = lastWith(hrvTrend(days), (p) => p.avg7 !== undefined);
  if (!hrv) return { ...base, state: 'nodata', value: '—', detail: 'Sin datos de HRV nocturna' };
  const value = fmt.ms(hrv.avg7!);
  if (hrv.low === undefined || hrv.high === undefined) {
    return {
      ...base,
      state: 'calibrating',
      value,
      detail: `Calibrando tu rango (${hrv.nights}/${HRV_MIN_NIGHTS} noches)`,
    };
  }
  const range = `rango ${fmt.ms(hrv.low)}–${fmt.ms(hrv.high)}`;
  if (hrv.avg7! < hrv.low) return { ...base, state: 'warn', value, detail: `Por debajo de tu ${range}` };
  if (hrv.avg7! > hrv.high) return { ...base, state: 'high', value, detail: `Por encima de tu ${range}` };
  return { ...base, state: 'ok', value, detail: `Dentro de tu ${range}` };
}

function restingHrSignal(days: DayHealth[]): Signal {
  const base = { key: 'rhr', label: 'FC en reposo' } as const;
  const rhr = lastWith(
    deltaTrend(days, (d) => d.restingHr, RHR_WINDOW),
    (p) => p.delta !== undefined,
  );
  if (!rhr) return { ...base, state: 'nodata', value: '—', detail: 'Sin línea base todavía' };
  const delta = rhr.delta!;
  return {
    ...base,
    state: delta >= RHR_ALERT_BPM ? 'warn' : 'ok',
    value: `${Math.round(rhr.value!)} ppm`,
    detail: `${signOf(delta)}${Math.abs(Math.round(delta))} ppm frente a tu habitual (${Math.round(rhr.base!)})`,
  };
}

function respirationSignal(days: DayHealth[]): Signal | undefined {
  const resp = lastWith(
    deltaTrend(days, (d) => d.sleepRespiration, RESP_WINDOW),
    (p) => p.delta !== undefined,
  );
  if (!resp) return undefined;
  const d = Math.round(resp.delta! * 10) / 10;
  return {
    key: 'resp',
    label: 'Respiración nocturna',
    state: resp.delta! >= RESP_ALERT_RPM ? 'warn' : 'ok',
    value: `${Math.round(resp.value!)} rpm`,
    detail: `${signOf(d)}${Math.abs(d).toLocaleString('es-ES')} rpm frente a tu habitual`,
  };
}

function sleepDebtSignal(days: DayHealth[], fmt: Fmt): Signal | undefined {
  const debt = sleepDebt(days);
  if (debt.nights < 3) return undefined;
  return {
    key: 'sleep',
    label: 'Deuda de sueño (7 noches)',
    state: debt.debtS >= SLEEP_DEBT_ALERT_S ? 'warn' : 'ok',
    value: fmt.hm(debt.debtS),
    detail:
      debt.debtS < 600
        ? 'Has cubierto tu necesidad de sueño'
        : 'Lo que te faltó frente a la necesidad que calcula Garmin',
  };
}

/** 0–1 señales fuera de rango: normal; 2: atención; ≥3: alerta. Con menos de 2 señales útiles, calibrando. */
function dayState(signals: Signal[]): DayState {
  const usable = signals.filter((s) => s.state === 'ok' || s.state === 'warn' || s.state === 'high').length;
  if (usable < 2) return 'calibrating';
  const warns = signals.filter((s) => s.state === 'warn').length;
  if (warns >= 3) return 'alert';
  if (warns === 2) return 'attention';
  return 'normal';
}

/**
 * Estado de hoy a partir de cuántas señales se salen de su rango: 0–1 normal, 2 atención, ≥3 alerta.
 * La HRV por encima del rango se muestra pero no suma (puede ser buena o reflejar sobrecarga).
 */
export function todayStatus(days: DayHealth[], fmt: Fmt) {
  const signals = [
    hrvSignal(days, fmt),
    restingHrSignal(days),
    respirationSignal(days),
    sleepDebtSignal(days, fmt),
  ].filter((x): x is Signal => x !== undefined);
  return { state: dayState(signals), warns: signals.filter((x) => x.state === 'warn').length, signals };
}

export interface WeekIntensity {
  week: string;
  moderate: number;
  /** vigorosos ya multiplicados ×2, como los cuenta Garmin y la OMS */
  vigorousX2: number;
  total: number;
}

/**
 * Zonas de FC (1–5, las de Garmin) que cuentan como minutos moderados y vigorosos al calcularlos desde las
 * actividades. Con las zonas por defecto (% FC máx.) Z2–Z3 ≈ 60–80 % y Z4–Z5 ≥ 80 %, cerca de los cortes del
 * ACSM (moderado 64–76 %, vigoroso ≥ 77 %). Orientativo.
 */
export const INTENSITY_ZONES = { moderate: [2, 3], vigorous: [4, 5] } as const;

/** Minutos moderados y vigorosos de una actividad según su tiempo en cada zona de FC. */
export function activityIntensity(hrZonesS: number[]): { moderate: number; vigorous: number } {
  const sum = (zones: readonly number[]) => zones.reduce((t, z) => t + (hrZonesS[z - 1] ?? 0), 0) / 60;
  return { moderate: sum(INTENSITY_ZONES.moderate), vigorous: sum(INTENSITY_ZONES.vigorous) };
}

/**
 * Minutos de intensidad por semana (lunes–domingo) para las `weeks` semanas que terminan en la de `today`.
 * La API de Garmin devuelve a menudo 0 en el resumen diario aunque haya entrenos; por eso, cada día se toma
 * lo mayor entre el dato de Garmin y lo calculado con las zonas de FC de las actividades de ese día.
 */
export function weeklyIntensity(
  days: DayHealth[],
  weeks: number,
  today: string,
  activities: Pick<Activity, 'date' | 'hrZonesS'>[] = [],
): WeekIntensity[] {
  const current = weekStart(today);
  const out: WeekIntensity[] = [];
  for (let i = weeks - 1; i >= 0; i--)
    out.push({ week: addDays(current, -7 * i), moderate: 0, vigorousX2: 0, total: 0 });
  const byWeek = new Map(out.map((w) => [w.week, w]));

  const fromActs = new Map<string, { moderate: number; vigorous: number }>();
  for (const a of activities) {
    const acc = fromActs.get(a.date) ?? { moderate: 0, vigorous: 0 };
    const m = activityIntensity(a.hrZonesS);
    acc.moderate += m.moderate;
    acc.vigorous += m.vigorous;
    fromActs.set(a.date, acc);
  }
  const dates = new Set([...days.map((d) => d.date), ...fromActs.keys()]);
  const garmin = new Map(days.map((d) => [d.date, d]));
  for (const date of dates) {
    const w = byWeek.get(weekStart(date));
    if (!w) continue;
    const g = garmin.get(date);
    const act = fromActs.get(date);
    w.moderate += Math.round(Math.max(g?.intensityModerate ?? 0, act?.moderate ?? 0));
    w.vigorousX2 += 2 * Math.round(Math.max(g?.intensityVigorous ?? 0, act?.vigorous ?? 0));
  }
  for (const w of out) w.total = w.moderate + w.vigorousX2;
  return out;
}

/** Meta de pasos por edad (Paluch 2022: el beneficio se aplana en 8.000–10.000 < 60 años y 6.000–8.000 ≥ 60). */
export const stepTarget = (age?: number) => (age !== undefined && age >= 60 ? 7000 : 8000);
