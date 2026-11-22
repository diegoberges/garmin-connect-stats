/**
 * Progresión (fase 3 del informe del dashboard):
 *  - VO2máx estimado por sesión: el coste de oxígeno del ritmo (fórmula de Daniels) dividido por la
 *    fracción de VO2máx que corresponde a la FC (Swain 1994: %FCmáx = 0,64 × %VO2máx + 37). Solo en
 *    carreras de asfalto/cinta con poco desnivel, sin las muy cortas ni a FC muy baja o muy alta. Es una
 *    estimación ruidosa: se usa su media móvil de 28 días.
 *  - Pronósticos a lo largo del tiempo: VDOT de la mejor marca (≥ 5 km) de los 90 días previos a cada semana.
 *  - Competiciones: VDOT de la carrera (con el tiempo total) frente al VO2máx estimado de ese momento.
 */
import { addDays, weekStart } from './dates';
import { predictTime, vdot } from './efficiency';
import type { Activity } from './garmin/types';
import { raceTime } from './races';

const ROAD = /^(running|treadmill_running|street_running|track_running|indoor_running)$/;

/** Carreras en las que la estimación por FC tiene sentido. */
export function isVo2Candidate(a: Activity): boolean {
  if (!ROAD.test(a.typeKey) || !a.avgHr) return false;
  if (a.distanceKm < 3 || a.movingS < 20 * 60 || a.movingS > 150 * 60) return false;
  return (a.elevationGainM ?? 0) / a.distanceKm <= 15;
}

/** Coste de oxígeno (ml/kg/min) de correr a `v` m/min (Daniels/Gilbert). */
export const vo2AtSpeed = (v: number) => -4.6 + 0.182258 * v + 0.000104 * v * v;

/** VO2máx estimado de una sesión, o undefined si la FC queda fuera del rango útil (65–95 % de la máxima). */
export function vo2FromRun(a: Pick<Activity, 'distanceKm' | 'movingS' | 'avgHr'>, maxHr: number): number | undefined {
  if (!a.avgHr || a.movingS <= 0 || a.distanceKm <= 0 || maxHr <= 0) return undefined;
  const pctHr = a.avgHr / maxHr;
  if (pctHr < 0.65 || pctHr > 0.95) return undefined;
  const pctVo2 = (pctHr - 0.37) / 0.64;
  return vo2AtSpeed((a.distanceKm * 1000) / (a.movingS / 60)) / pctVo2;
}

export interface Vo2EstimatePoint {
  date: string;
  id: number;
  value: number;
  /** media de las estimaciones de los 28 días previos (incluida esta), con al menos 2 */
  avg28?: number;
}

export function vo2Trend(runs: Activity[], maxHr: number): Vo2EstimatePoint[] {
  const pts = runs
    .filter(isVo2Candidate)
    .map((a) => ({ date: a.date, id: a.id, value: vo2FromRun(a, maxHr) }))
    .filter((p): p is { date: string; id: number; value: number } => p.value !== undefined)
    .sort((a, b) => a.date.localeCompare(b.date));
  return pts.map((p) => {
    const from = addDays(p.date, -27);
    const win = pts.filter((q) => q.date >= from && q.date <= p.date);
    return { ...p, avg28: win.length >= 2 ? win.reduce((s, q) => s + q.value, 0) / win.length : undefined };
  });
}

/** Último valor de la media móvil en o antes de `date` (la forma estimada de ese día). */
export function vo2At(trend: Vo2EstimatePoint[], date: string): number | undefined {
  return trend.findLast((p) => p.date <= date && p.avg28 !== undefined)?.avg28;
}

export interface PredictionPoint {
  week: string;
  vdot?: number;
  /** segundos */
  t10k?: number;
  tHalf?: number;
}

/** Mejores marcas a considerar: las de 5 km o más (las cortas sobrestiman la resistencia). */
const PREDICT_FROM = [5000, 10000, 21098, 42195] as const;

/** Mayor VDOT de las mejores marcas (≥ 5 km) de las carreras entre dos fechas. */
export function bestVdot(runs: Activity[], from: string, to: string): number | undefined {
  let best: number | undefined;
  for (const r of runs) {
    if (r.date < from || r.date > to) continue;
    for (const d of PREDICT_FROM) {
      const t = r.bestEfforts[d];
      if (t && t > 0) best = Math.max(best ?? 0, vdot(d, t));
    }
  }
  return best;
}

/**
 * Pronóstico de 10K y media semana a semana: VDOT de la mejor marca (≥ 5 km) de los 90 días que acaban
 * en cada semana. Sin marcas en la ventana, sin pronóstico.
 */
export function predictionTrend(runs: Activity[], weeks: number, today: string, windowDays = 90): PredictionPoint[] {
  const current = weekStart(today);
  const out: PredictionPoint[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const week = addDays(current, -7 * i);
    const end = i === 0 ? today : addDays(week, 6);
    const best = bestVdot(runs, addDays(end, -(windowDays - 1)), end);
    out.push(
      best === undefined
        ? { week }
        : { week, vdot: best, t10k: predictTime(best, 10000), tHalf: predictTime(best, 21097.5) },
    );
  }
  return out;
}

export interface RaceAnalysis {
  /** VDOT que da la marca de la carrera */
  raceVdot?: number;
  /** VO2máx estimado (media de 28 días) de ese momento */
  shape?: number;
  /** raceVdot − shape: positivo = rendiste por encima de lo que indicaba tu forma */
  diff?: number;
}

export function analyzeRace(race: Activity, trend: Vo2EstimatePoint[]): RaceAnalysis {
  const t = raceTime(race);
  // En trail o ultra la marca depende del terreno: el VDOT no es comparable
  const isRun = /run/.test(race.typeKey) && !/trail|ultra/.test(race.typeKey);
  const raceVdot = isRun && race.distanceKm >= 3 && t > 0 ? vdot(race.distanceKm * 1000, t) : undefined;
  const shape = vo2At(trend, race.date);
  return { raceVdot, shape, diff: raceVdot !== undefined && shape !== undefined ? raceVdot - shape : undefined };
}
