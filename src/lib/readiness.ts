/**
 * Disposición (readiness) de 0 a 100: combinación ponderada de puntuaciones z frente a tu propia línea
 * base, con pesos sencillos y documentados (no una caja negra; ver el informe del dashboard):
 *
 *   VFC de anoche          35 %   z = (ln VFC − media ln 60 d) / DE
 *   FC en reposo           25 %   z = −(FC − media 60 d) / DE          (más alta = peor)
 *   Sueño de anoche        25 %   z = (dormido − objetivo) / DE del sueño 60 d
 *   Forma (TSB)            15 %   z = (TSB − media 60 d) / DE
 *
 * Cada z se limita a ±3. Puntuación = 50 + 15 × Σ(peso × z) / Σ(pesos disponibles), entre 0 y 100:
 * 50 es tu día normal; cada desviación típica media suma o resta 15 puntos. Hacen falta al menos
 * 2 componentes. Es orientativa: los pesos son una elección razonable, no un modelo validado.
 */
import { addDays, dateRange } from './dates';
import type { DayHealth } from './garmin/types';

export const READINESS_WEIGHTS = { hrv: 0.35, rhr: 0.25, sleep: 0.25, tsb: 0.15 } as const;
export type ReadinessKey = keyof typeof READINESS_WEIGHTS;
const BASE_DAYS = 60;
const MIN_BASE = 14;
const Z_CAP = 3;
const POINTS_PER_SD = 15;

export interface ReadinessPart {
  key: ReadinessKey;
  label: string;
  weight: number;
  z: number;
  /** Valor de hoy, para mostrarlo. */
  value: number;
}
export interface Readiness {
  score: number;
  parts: ReadinessPart[];
  /** Componentes que faltan (sin dato hoy o sin línea base). */
  missing: ReadinessKey[];
}

const LABELS: Record<ReadinessKey, string> = {
  hrv: 'VFC de anoche',
  rhr: 'FC en reposo',
  sleep: 'Sueño de anoche',
  tsb: 'Forma',
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
function stats(xs: number[]): { mean: number; sd: number } | undefined {
  if (xs.length < MIN_BASE) return undefined;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1));
  return sd > 0 ? { mean, sd } : undefined;
}

/** z del valor de hoy frente a los 60 días anteriores (sin incluir hoy). */
function zOf(series: Map<string, number>, date: string, invert = false): { z: number; value: number } | undefined {
  const value = series.get(date);
  if (value === undefined) return undefined;
  const base = dateRange(addDays(date, -BASE_DAYS), addDays(date, -1))
    .map((d) => series.get(d))
    .filter((x): x is number => x !== undefined);
  const s = stats(base);
  if (!s) return undefined;
  const z = (value - s.mean) / s.sd;
  return { z: clamp(invert ? -z : z, -Z_CAP, Z_CAP), value };
}

const seriesOf = (days: DayHealth[], pick: (d: DayHealth) => number | undefined) =>
  new Map(
    days.flatMap((d) => {
      const v = pick(d);
      return v !== undefined && Number.isFinite(v) ? [[d.date, v] as const] : [];
    }),
  );

/**
 * Disposición del día `date`. `tsb` es la serie diaria de forma (TSB) del modelo de carga y
 * `sleepTargetS` el objetivo de sueño (sin él, la necesidad de Garmin de esa noche, o 7,5 h).
 */
export function readiness(
  days: DayHealth[],
  date: string,
  tsb: Map<string, number>,
  sleepTargetS?: number,
): Readiness | undefined {
  const parts: ReadinessPart[] = [];
  const missing: ReadinessKey[] = [];
  const add = (key: ReadinessKey, r: { z: number; value: number } | undefined) => {
    if (r) parts.push({ key, label: LABELS[key], weight: READINESS_WEIGHTS[key], ...r });
    else missing.push(key);
  };

  const hrv = zOf(
    seriesOf(days, (d) => (d.hrvLastNight && d.hrvLastNight > 0 ? Math.log(d.hrvLastNight) : undefined)),
    date,
  );
  add('hrv', hrv && { z: hrv.z, value: Math.exp(hrv.value) });
  add(
    'rhr',
    zOf(
      seriesOf(days, (d) => d.restingHr),
      date,
      true,
    ),
  );

  // Sueño: centrado en el objetivo (no en tu media, que normalizaría dormir poco siempre)
  const sleep = seriesOf(days, (d) => d.sleepS);
  const today = days.find((d) => d.date === date);
  const sleepBase = stats(
    dateRange(addDays(date, -BASE_DAYS), addDays(date, -1))
      .map((d) => sleep.get(d))
      .filter((x): x is number => x !== undefined),
  );
  const slept = sleep.get(date);
  if (slept !== undefined && sleepBase) {
    const target = sleepTargetS ?? today?.sleepNeedS ?? 7.5 * 3600;
    add('sleep', { z: clamp((slept - target) / sleepBase.sd, -Z_CAP, Z_CAP), value: slept });
  } else add('sleep', undefined);

  add('tsb', zOf(tsb, date));

  if (parts.length < 2) return undefined;
  const wsum = parts.reduce((a, p) => a + p.weight, 0);
  const zsum = parts.reduce((a, p) => a + p.weight * p.z, 0);
  return { score: Math.round(clamp(50 + (POINTS_PER_SD * zsum) / wsum, 0, 100)), parts, missing };
}

/** Lectura en texto de la puntuación (orientativa). */
export function readinessLabel(score: number): string {
  if (score >= 65) return 'Mejor que tu día normal';
  if (score >= 40) return 'Como tu día normal';
  if (score >= 25) return 'Por debajo de lo normal';
  return 'Muy por debajo de lo normal';
}
