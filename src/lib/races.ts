/**
 * Competiciones: categoría por distancia oficial (con margen para la medición del GPS) y mejor marca en cada una.
 * Trails y distancias no estándar quedan como "Otra" y no compiten por "mejor marca".
 */
import type { Activity } from './garmin/types';

export type RaceCategory = '5K' | '10K' | 'Media' | 'Maratón' | 'Otra';

const RANGES: [RaceCategory, number, number][] = [
  ['5K', 4.8, 5.35],
  ['10K', 9.6, 10.6],
  ['Media', 20.7, 21.7],
  ['Maratón', 41.5, 43.2],
];

/** Solo carreras de asfalto/cinta/pista: en trail la distancia no es comparable. */
export function raceCategory(a: Pick<Activity, 'distanceKm' | 'typeKey'>): RaceCategory {
  if (!/run/.test(a.typeKey) || /trail|ultra/.test(a.typeKey)) return 'Otra';
  return RANGES.find(([, lo, hi]) => a.distanceKm >= lo && a.distanceKm <= hi)?.[0] ?? 'Otra';
}

/** Tiempo de una competición: el total con pausas (como Strava); si falta, el del temporizador. */
export const raceTime = (a: Pick<Activity, 'elapsedS' | 'durationS'>) => a.elapsedS ?? a.durationS;

/** Id de la mejor competición (menor tiempo) en cada categoría estándar. */
export function bestRaceIds(races: Activity[]): Set<number> {
  const best = new Map<RaceCategory, Activity>();
  for (const r of races) {
    const c = raceCategory(r);
    if (c === 'Otra' || !raceTime(r)) continue;
    const cur = best.get(c);
    if (!cur || raceTime(r) < raceTime(cur)) best.set(c, r);
  }
  return new Set([...best.values()].map((r) => r.id));
}
