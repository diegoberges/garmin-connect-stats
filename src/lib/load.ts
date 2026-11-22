/**
 * Carga de entrenamiento y su balance (ver reports/Métricas de salud y rendimiento.md y el informe del dashboard):
 *  - Carga por sesión: **TRIMP de Banister**, la única métrica de carga de la app (no se mezcla con la de
 *    Garmin ni con otras escalas): `min × HRr × a × e^(b × HRr)`, con HRr = (FC media − reposo)/(máx − reposo)
 *    y a/b = 0,64/1,92 (hombres) o 0,86/1,67 (mujeres). FC en reposo y máxima, de las zonas de Garmin.
 *    Se calcula igual para cualquier deporte con FC (también caminatas y fuerza); sin FC, la sesión no suma.
 *  - Forma física / fatiga / forma: medias exponenciales de 42 y 7 días de la carga diaria (modelo Banister/Coggan),
 *    forma = forma física − fatiga, y forma en % de la forma física (como intervals.icu).
 *  - Las bandas de forma son heurísticas de entrenadores, no umbrales validados.
 */
import { addDays, dateRange, weekStart } from './dates';
import { BEST_EFFORT_DISTANCES, type Activity, type BestEffortDistance } from './garmin/types';

export const FITNESS_DAYS = 42;
export const FATIGUE_DAYS = 7;
/** Días de historial previos al periodo visible para que la media de 42 días arranque estabilizada */
export const WARMUP_DAYS = 120;
export const WEEKLY_SPIKE_PCT = 25;

/** FC de referencia para el TRIMP (de la configuración de zonas de Garmin) y sexo (de tu perfil). */
export interface HrParams {
  restingHr: number;
  maxHr: number;
  /** Sin indicar se usan los coeficientes masculinos (los del informe). */
  sex?: 'male' | 'female';
}

/**
 * Respaldo si Garmin no da la FC de referencia: la máxima registrada en las actividades (al menos 150) y
 * 60 ppm en reposo. Es una estimación y la interfaz debe decirlo.
 */
export function estimateHrParams(activities: Pick<Activity, 'maxHr'>[]): { restingHr: number; maxHr: number } {
  const observed = Math.max(0, ...activities.map((a) => a.maxHr ?? 0));
  return { restingHr: 60, maxHr: observed >= 150 ? observed : 190 };
}

/** Coeficientes de Banister por sexo. */
const BANISTER = { male: { a: 0.64, b: 1.92 }, female: { a: 0.86, b: 1.67 } } as const;

/** TRIMP de Banister de una sesión (0 si la FC de referencia no tiene sentido). */
export function banisterTrimp(minutes: number, avgHr: number, p: HrParams): number {
  const reserve = p.maxHr - p.restingHr;
  if (minutes <= 0 || reserve <= 0) return 0;
  const hrr = Math.min(1, Math.max(0, (avgHr - p.restingHr) / reserve));
  const { a, b } = BANISTER[p.sex ?? 'male'];
  return minutes * hrr * a * Math.exp(b * hrr);
}

/** Carga de una sesión: TRIMP de Banister con la FC media; sin FC, 0. */
export const sessionLoad = (act: Activity, p: HrParams) =>
  act.avgHr ? banisterTrimp(act.movingS / 60, act.avgHr, p) : 0;

/** Carga total por día en [from, to] (días sin actividad = 0). */
export function dailyLoad(
  activities: Activity[],
  from: string,
  to: string,
  p: HrParams,
): { date: string; load: number }[] {
  const byDate = new Map(dateRange(from, to).map((d) => [d, 0]));
  for (const a of activities) if (byDate.has(a.date)) byDate.set(a.date, byDate.get(a.date)! + sessionLoad(a, p));
  return [...byDate.entries()].map(([date, load]) => ({ date, load }));
}

export interface PmcPoint {
  date: string;
  load: number;
  fitness: number;
  fatigue: number;
  form: number;
  /** forma en % de la forma física (undefined si aún no hay forma física) */
  formPct?: number;
}

/**
 * Modelo forma física/fatiga: EWMA con constantes de 42 y 7 días sobre la carga diaria.
 * La forma en % solo se da tras 42 días desde la primera carga: antes la forma física está a medio
 * construir y la forma saldría exageradamente negativa.
 */
export function pmc(days: { date: string; load: number }[]): PmcPoint[] {
  let fitness = 0;
  let fatigue = 0;
  const firstLoad = days.findIndex((d) => d.load > 0);
  return days.map(({ date, load }, i) => {
    fitness += (load - fitness) / FITNESS_DAYS;
    fatigue += (load - fatigue) / FATIGUE_DAYS;
    const form = fitness - fatigue;
    const ready = firstLoad >= 0 && i - firstLoad >= FITNESS_DAYS && fitness >= 1;
    return { date, load, fitness, fatigue, form, formPct: ready ? (form / fitness) * 100 : undefined };
  });
}

export type FormZone = 'transition' | 'fresh' | 'neutral' | 'optimal' | 'risk';
export const FORM_ZONES: { zone: FormZone; min: number; label: string; text: string }[] = [
  {
    zone: 'transition',
    min: 20,
    label: 'Muy descansado',
    text: 'Llevas tiempo con poca carga: estás fresco, pero puedes estar perdiendo forma.',
  },
  { zone: 'fresh', min: 5, label: 'Fresco', text: 'Buen momento para competir o para un entreno exigente.' },
  { zone: 'neutral', min: -10, label: 'Neutral', text: 'Carga en equilibrio: mantienes la forma.' },
  {
    zone: 'optimal',
    min: -30,
    label: 'Productivo',
    text: 'Estás acumulando carga a un ritmo que suele mejorar la forma.',
  },
  {
    zone: 'risk',
    min: -Infinity,
    label: 'Sobrecarga',
    text: 'La fatiga supera con mucho a tu forma: prioriza recuperar.',
  },
];
export const formZone = (pct: number) => FORM_ZONES.find((z) => pct >= z.min)!;

/**
 * Ratio agudo:crónico (ACWR) = fatiga (7 d) / forma física (42 d). Bandas orientativas (Gabbett):
 * < 0,8 carga baja, 0,8–1,3 óptima, 1,3–1,5 elevada, > 1,5 riesgo de lesión.
 */
export type AcwrZone = 'low' | 'optimal' | 'elevated' | 'risk';
export const ACWR_ZONES: { zone: AcwrZone; max: number; label: string }[] = [
  { zone: 'low', max: 0.8, label: 'Carga baja' },
  { zone: 'optimal', max: 1.3, label: 'Óptima' },
  { zone: 'elevated', max: 1.5, label: 'Elevada' },
  { zone: 'risk', max: Infinity, label: 'Riesgo' },
];
/** ACWR de un punto (undefined mientras la forma física sea casi nula). */
export const acwr = (p: Pick<PmcPoint, 'fitness' | 'fatigue'>) => (p.fitness >= 1 ? p.fatigue / p.fitness : undefined);
export const acwrZone = (ratio: number) => ACWR_ZONES.find((z) => ratio < z.max)!;

/** Rampa: cuánto ha subido la forma física (CTL) en 7 días. Orientativo: > 5 vigilar, > 8 demasiado rápido. */
export const RAMP_WATCH = 5;
export const RAMP_ALERT = 8;
export function rampRate(points: PmcPoint[]): number | undefined {
  const now = points.at(-1);
  const weekAgo = points.at(-8);
  return now && weekAgo && now.formPct !== undefined ? now.fitness - weekAgo.fitness : undefined;
}

/**
 * Monotonía y strain de Foster con la carga de los últimos 7 días:
 * monotonía = media / DE (cuanto más alta, menos variedad entre días duros y suaves; > 2 suele indicar
 * poca variedad) y strain = carga semanal × monotonía. Sin variación (DE = 0) no se puede calcular.
 */
export const MONOTONY_HIGH = 2;
export function monotonyStrain(
  days: { load: number }[],
): { monotony: number; strain: number; total: number } | undefined {
  const week = days.slice(-7).map((d) => d.load);
  if (week.length < 7) return undefined;
  const total = week.reduce((a, b) => a + b, 0);
  const avg = total / 7;
  const sd = Math.sqrt(week.reduce((a, b) => a + (b - avg) ** 2, 0) / 7);
  if (total <= 0 || sd === 0) return undefined;
  const monotony = avg / sd;
  return { monotony, strain: total * monotony, total };
}

export interface WeekLoad {
  week: string;
  total: number;
  /** carga por tipo de actividad */
  byType: Record<string, number>;
  /** días distintos con fuerza */
  strengthDays: number;
  /** segundos en baja (Z1–Z2), moderada (Z3) y alta (Z4–Z5) intensidad */
  low: number;
  mid: number;
  high: number;
}

/** Carga, tipos e intensidad por semana (lunes–domingo) para las `weeks` semanas que acaban en la de `today`. */
export function weeklyLoad(activities: Activity[], weeks: number, today: string, p: HrParams): WeekLoad[] {
  const current = weekStart(today);
  const out: WeekLoad[] = [];
  for (let i = weeks - 1; i >= 0; i--)
    out.push({ week: addDays(current, -7 * i), total: 0, byType: {}, strengthDays: 0, low: 0, mid: 0, high: 0 });
  const byWeek = new Map(out.map((w) => [w.week, w]));
  const strength = new Map<string, Set<string>>();
  for (const a of activities) {
    const w = byWeek.get(weekStart(a.date));
    if (!w) continue;
    const l = sessionLoad(a, p);
    w.total += l;
    w.byType[a.typeKey] = (w.byType[a.typeKey] ?? 0) + l;
    const [z1, z2, z3, z4, z5] = a.hrZonesS;
    w.low += z1 + z2;
    w.mid += z3;
    w.high += z4 + z5;
    if (a.typeKey === 'strength_training') {
      if (!strength.has(w.week)) strength.set(w.week, new Set());
      strength.get(w.week)!.add(a.date);
    }
  }
  for (const w of out) w.strengthDays = strength.get(w.week)?.size ?? 0;
  return out;
}

/** Cambio de la última semana completa frente a la media de las 4 anteriores (%). */
export function weeklyChange(weeks: WeekLoad[]): { last: WeekLoad; avg4: number; pct?: number } | undefined {
  const complete = weeks.slice(0, -1); // la semana en curso no ha terminado
  if (complete.length < 5) return undefined;
  const last = complete.at(-1)!;
  const prev = complete.slice(-5, -1);
  const avg4 = prev.reduce((a, w) => a + w.total, 0) / prev.length;
  return { last, avg4, pct: avg4 > 0 ? ((last.total - avg4) / avg4) * 100 : undefined };
}

export interface BestEffort {
  distance: BestEffortDistance;
  timeS: number;
  date: string;
  activityId: number;
  activityName: string;
}

/** Mejor tiempo en cada distancia estándar entre las actividades dadas. */
export function bestEfforts(activities: Activity[]): BestEffort[] {
  return BEST_EFFORT_DISTANCES.flatMap((distance) => {
    let best: BestEffort | undefined;
    for (const a of activities) {
      const t = a.bestEfforts[distance];
      if (t !== undefined && t > 0 && (!best || t < best.timeS))
        best = { distance, timeS: t, date: a.date, activityId: a.id, activityName: a.name };
    }
    return best ? [best] : [];
  });
}
