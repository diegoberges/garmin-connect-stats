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
import type { DayHealth } from './garmin/types';

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
  const s = [...xs].sort((a, b) => a - b);
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
const lastWith = <T>(xs: T[], has: (x: T) => boolean) => [...xs].reverse().find(has);

/**
 * Estado de hoy a partir de cuántas señales se salen de su rango: 0–1 normal, 2 atención, ≥3 alerta.
 * La HRV por encima del rango se muestra pero no suma (puede ser buena o reflejar sobrecarga).
 */
export function todayStatus(days: DayHealth[], fmt: { ms: (v: number) => string; hm: (s: number) => string }) {
  const signals: Signal[] = [];

  const hrv = lastWith(hrvTrend(days), (p) => p.avg7 !== undefined);
  if (!hrv)
    signals.push({
      key: 'hrv',
      label: 'HRV (7 días)',
      state: 'nodata',
      value: '—',
      detail: 'Sin datos de HRV nocturna',
    });
  else if (hrv.low === undefined)
    signals.push({
      key: 'hrv',
      label: 'HRV (7 días)',
      state: 'calibrating',
      value: fmt.ms(hrv.avg7!),
      detail: `Calibrando tu rango (${hrv.nights}/${HRV_MIN_NIGHTS} noches)`,
    });
  else {
    const state: SignalState = hrv.avg7! < hrv.low ? 'warn' : hrv.avg7! > hrv.high! ? 'high' : 'ok';
    const range = `rango ${fmt.ms(hrv.low)}–${fmt.ms(hrv.high!)}`;
    signals.push({
      key: 'hrv',
      label: 'HRV (7 días)',
      state,
      value: fmt.ms(hrv.avg7!),
      detail:
        state === 'warn'
          ? `Por debajo de tu ${range}`
          : state === 'high'
            ? `Por encima de tu ${range}`
            : `Dentro de tu ${range}`,
    });
  }

  const rhr = lastWith(
    deltaTrend(days, (d) => d.restingHr, RHR_WINDOW),
    (p) => p.delta !== undefined,
  );
  if (!rhr)
    signals.push({ key: 'rhr', label: 'FC en reposo', state: 'nodata', value: '—', detail: 'Sin línea base todavía' });
  else {
    const sign = rhr.delta! > 0 ? '+' : rhr.delta! < 0 ? '−' : '±';
    signals.push({
      key: 'rhr',
      label: 'FC en reposo',
      state: rhr.delta! >= RHR_ALERT_BPM ? 'warn' : 'ok',
      value: `${Math.round(rhr.value!)} ppm`,
      detail: `${sign}${Math.abs(Math.round(rhr.delta!))} ppm frente a tu habitual (${Math.round(rhr.base!)})`,
    });
  }

  const resp = lastWith(
    deltaTrend(days, (d) => d.sleepRespiration, RESP_WINDOW),
    (p) => p.delta !== undefined,
  );
  if (resp) {
    const d = Math.round(resp.delta! * 10) / 10;
    signals.push({
      key: 'resp',
      label: 'Respiración nocturna',
      state: resp.delta! >= RESP_ALERT_RPM ? 'warn' : 'ok',
      value: `${Math.round(resp.value!)} rpm`,
      detail: `${d > 0 ? '+' : d < 0 ? '−' : '±'}${Math.abs(d).toLocaleString('es-ES')} rpm frente a tu habitual`,
    });
  }

  const debt = sleepDebt(days);
  if (debt.nights >= 3)
    signals.push({
      key: 'sleep',
      label: 'Deuda de sueño (7 noches)',
      state: debt.debtS >= SLEEP_DEBT_ALERT_S ? 'warn' : 'ok',
      value: fmt.hm(debt.debtS),
      detail:
        debt.debtS < 600
          ? 'Has cubierto tu necesidad de sueño'
          : 'Lo que te faltó frente a la necesidad que calcula Garmin',
    });

  const warns = signals.filter((s) => s.state === 'warn').length;
  const usable = signals.filter((s) => s.state === 'ok' || s.state === 'warn' || s.state === 'high').length;
  const state: DayState = usable < 2 ? 'calibrating' : warns >= 3 ? 'alert' : warns === 2 ? 'attention' : 'normal';
  return { state, warns, signals };
}

export interface WeekIntensity {
  week: string;
  moderate: number;
  /** vigorosos ya multiplicados ×2, como los cuenta Garmin y la OMS */
  vigorousX2: number;
  total: number;
}

/** Minutos de intensidad por semana (lunes–domingo) para las `weeks` semanas que terminan en la de `today`. */
export function weeklyIntensity(days: DayHealth[], weeks: number, today: string): WeekIntensity[] {
  const current = weekStart(today);
  const out: WeekIntensity[] = [];
  for (let i = weeks - 1; i >= 0; i--)
    out.push({ week: addDays(current, -7 * i), moderate: 0, vigorousX2: 0, total: 0 });
  const byWeek = new Map(out.map((w) => [w.week, w]));
  for (const d of days) {
    const w = byWeek.get(weekStart(d.date));
    if (!w) continue;
    w.moderate += d.intensityModerate ?? 0;
    w.vigorousX2 += 2 * (d.intensityVigorous ?? 0);
  }
  for (const w of out) w.total = w.moderate + w.vigorousX2;
  return out;
}

/** Meta de pasos por edad (Paluch 2022: el beneficio se aplana en 8.000–10.000 < 60 años y 6.000–8.000 ≥ 60). */
export const stepTarget = (age?: number) => (age !== undefined && age >= 60 ? 7000 : 8000);
