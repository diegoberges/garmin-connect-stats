/**
 * Carga de entrenamiento y su balance (ver reports/Métricas de salud y rendimiento.md):
 *  - Carga por sesión: la "Training Load" de Garmin (EPOC) que trae cada actividad. Si falta, TRIMP de Edwards
 *    con los minutos en zonas (otra escala: solo como respaldo puntual).
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

/** TRIMP de Edwards: minutos en zona × número de zona (1–5). */
export const edwardsTrimp = (zonesS: number[]) => zonesS.reduce((acc, s, i) => acc + (s / 60) * (i + 1), 0);

export const sessionLoad = (a: Activity) =>
  a.trainingLoad ?? (a.hrZonesS.some((s) => s > 0) ? edwardsTrimp(a.hrZonesS) : 0);

/** Carga total por día en [from, to] (días sin actividad = 0). */
export function dailyLoad(activities: Activity[], from: string, to: string): { date: string; load: number }[] {
  const byDate = new Map(dateRange(from, to).map((d) => [d, 0]));
  for (const a of activities) if (byDate.has(a.date)) byDate.set(a.date, byDate.get(a.date)! + sessionLoad(a));
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
export function weeklyLoad(activities: Activity[], weeks: number, today: string): WeekLoad[] {
  const current = weekStart(today);
  const out: WeekLoad[] = [];
  for (let i = weeks - 1; i >= 0; i--)
    out.push({ week: addDays(current, -7 * i), total: 0, byType: {}, strengthDays: 0, low: 0, mid: 0, high: 0 });
  const byWeek = new Map(out.map((w) => [w.week, w]));
  const strength = new Map<string, Set<string>>();
  for (const a of activities) {
    const w = byWeek.get(weekStart(a.date));
    if (!w) continue;
    const l = sessionLoad(a);
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
