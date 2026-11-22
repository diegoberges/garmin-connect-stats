/**
 * Eficiencia y progreso (fase 3, ver reports/Métricas de salud y rendimiento.md):
 *  - Ritmo ajustado por pendiente (GAP) con el coste energético de Minetti 2002.
 *  - Factor de eficiencia (EF): velocidad (m/min) ÷ FC media, solo en carreras comparables.
 *  - Desacoplamiento: caída del EF de la 1.ª a la 2.ª mitad (< 5 % suele indicar buena base; heurística).
 *  - VDOT de Daniels/Gilbert, predicción de tiempos y velocidad crítica (regresión distancia–tiempo).
 */
import type { Activity, BestEffortDistance } from './garmin/types';

/** Coste energético de correr (J/kg/m) según la pendiente i (fracción), Minetti et al. 2002. */
export function minettiCost(i: number): number {
  const g = Math.max(-0.45, Math.min(0.45, i));
  return 155.4 * g ** 5 - 30.4 * g ** 4 - 43.3 * g ** 3 + 46.3 * g ** 2 + 19.5 * g + 3.6;
}
/** Cuánto "vale" un metro con pendiente i frente a uno llano (1 = llano). */
export const gradeFactor = (i: number) => minettiCost(i) / minettiCost(0);

// ---------- Carreras comparables y EF ----------

/** Entrenos suaves y continuos de asfalto/cinta: lo único en lo que tiene sentido seguir la eficiencia. */
const EASY_LABELS = new Set(['RECOVERY', 'AEROBIC_BASE']);
export function isComparableRun(a: Activity): boolean {
  if (!/^(running|treadmill_running|street_running|track_running|indoor_running)$/.test(a.typeKey)) return false;
  if (!a.avgHr || a.distanceKm < 3) return false;
  if (a.movingS < 30 * 60 || a.movingS > 120 * 60) return false;
  if ((a.elevationGainM ?? 0) / a.distanceKm > 15) return false; // > 15 m/km: demasiado desnivel
  if (a.trainingEffectLabel && !EASY_LABELS.has(a.trainingEffectLabel)) return false;
  return true;
}

/** EF = metros por minuto ÷ ppm (TrainingPeaks/Friel usan la misma idea). Más alto = más eficiente. */
export const efficiencyFactor = (a: Pick<Activity, 'distanceKm' | 'movingS' | 'avgHr'>) =>
  a.avgHr && a.movingS > 0 ? (a.distanceKm * 1000) / (a.movingS / 60) / a.avgHr : undefined;

/** Ritmo (s/km) que corresponde a una FC dada con un EF: velocidad = EF × FC. */
export const paceAtHr = (ef: number, hr: number) => 1000 / ((ef * hr) / 60);

export interface EfPoint {
  date: string;
  id: number;
  ef: number;
  /** media móvil de las carreras comparables de los 28 días previos (incluida esta) */
  avg28?: number;
}

export function efTrend(runs: Activity[]): EfPoint[] {
  const pts = runs
    .filter(isComparableRun)
    .map((a) => ({ date: a.date, id: a.id, ef: efficiencyFactor(a)! }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return pts.map((p) => {
    const from = new Date(Date.parse(p.date) - 27 * 86_400_000).toISOString().slice(0, 10);
    const win = pts.filter((q) => q.date >= from && q.date <= p.date);
    return { ...p, avg28: win.length >= 2 ? win.reduce((s, q) => s + q.ef, 0) / win.length : undefined };
  });
}

// ---------- VDOT y predicción ----------

/** VDOT de Daniels/Gilbert a partir de una marca (m, s). */
export function vdot(distanceM: number, timeS: number): number {
  const t = timeS / 60;
  const v = distanceM / t; // m/min
  const vo2 = -4.6 + 0.182258 * v + 0.000104 * v * v;
  const pct = 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t);
  return vo2 / pct;
}

/** Tiempo (s) que corresponde a un VDOT en una distancia (búsqueda por bisección). */
export function predictTime(vdotValue: number, distanceM: number): number {
  let lo = distanceM / 600; // minutos a 36 km/h
  let hi = distanceM / 50; // minutos a 3 km/h
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    // más tiempo => VDOT más bajo
    if (vdot(distanceM, mid * 60) > vdotValue) lo = mid;
    else hi = mid;
  }
  return ((lo + hi) / 2) * 60;
}

/** Riegel: t2 = t1 · (d2/d1)^1.06 */
export const riegel = (d1: number, t1: number, d2: number, exp = 1.06) => t1 * (d2 / d1) ** exp;

/**
 * Velocidad crítica (m/s) y D′ (m) por regresión lineal distancia = CS·t + D′ sobre mejores marcas
 * de 2 a 60 min (Smyth & Muniz-Pumares 2020 la estiman igual con marcas de entrenamiento).
 */
export function criticalSpeed(efforts: { distance: BestEffortDistance; timeS: number }[]) {
  const pts = efforts.filter((e) => e.timeS >= 120 && e.timeS <= 60 * 60);
  if (pts.length < 3) return undefined;
  const n = pts.length;
  const mt = pts.reduce((s, p) => s + p.timeS, 0) / n;
  const md = pts.reduce((s, p) => s + p.distance, 0) / n;
  const sxy = pts.reduce((s, p) => s + (p.timeS - mt) * (p.distance - md), 0);
  const sxx = pts.reduce((s, p) => s + (p.timeS - mt) ** 2, 0);
  if (sxx === 0) return undefined;
  const cs = sxy / sxx;
  return cs > 0 ? { csMs: cs, dPrimeM: md - cs * mt } : undefined;
}
