/**
 * Análisis de una actividad (fase 4 del informe del dashboard):
 *  - Zonas de ritmo con el ritmo ajustado por pendiente (GAP), a partir del VDOT de Daniels de tus mejores
 *    marcas de los 180 días anteriores a la actividad: así las zonas quedan "versionadas por fecha" y un
 *    cambio de forma no reescribe el histórico. % del VO2máx (Daniels): fácil < 74, maratón 74–84,
 *    umbral 84–88, intervalos 88–100, repeticiones > 100.
 *  - Actividades en la misma ruta: mismo grupo de deporte, salida a menos de 250 m y distancia ±5 %.
 */
import { addDays } from './dates';
import type { Activity } from './garmin/types';
import { bestVdot } from './progression';
import { sportGroup } from './volume';

export const PACE_ZONES = [
  { key: 'easy', label: 'Z1 Fácil', maxPct: 0.74 },
  { key: 'marathon', label: 'Z2 Maratón', maxPct: 0.84 },
  { key: 'threshold', label: 'Z3 Umbral', maxPct: 0.88 },
  { key: 'interval', label: 'Z4 Intervalos', maxPct: 1 },
  { key: 'repetition', label: 'Z5 Repeticiones', maxPct: Infinity },
] as const;

/** Velocidad (m/s) a la que el coste de oxígeno es `pct` del VDOT (inversa de la fórmula de Daniels). */
export function danielsSpeed(vdotValue: number, pct: number): number {
  const a = 0.000104;
  const b = 0.182258;
  const c = -(4.6 + vdotValue * pct);
  const vMin = (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a); // m/min
  return vMin / 60;
}

/** Límites de velocidad (m/s) entre zonas de ritmo: 4 cortes para 5 zonas. */
export const paceZoneBounds = (vdotValue: number) =>
  PACE_ZONES.slice(0, -1).map((z) => danielsSpeed(vdotValue, z.maxPct));

/** Segundos en cada zona a partir del histograma de tiempo por velocidad (centro de cada tramo). */
export function timeInPaceZones(histogram: number[], bucket: number, bounds: number[]): number[] {
  const out = PACE_ZONES.map(() => 0);
  histogram.forEach((s, k) => {
    if (!s) return;
    const v = (k + 0.5) * bucket;
    const zone = bounds.findIndex((b) => v < b);
    out[zone === -1 ? out.length - 1 : zone] += s;
  });
  return out;
}

/** VDOT con el que medir una actividad: el de tus mejores marcas (≥ 5 km) de los 180 días anteriores. */
export const vdotForDate = (runs: Activity[], date: string) => bestVdot(runs, addDays(date, -180), date);

/** Distancia en metros entre dos puntos (haversine). */
export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

const ROUTE_START_M = 250;
const ROUTE_DISTANCE = 0.05;

/** Actividades en la misma ruta que `target` (incluida), de la más antigua a la más reciente. */
export function sameRoute(target: Activity, activities: Activity[]): Activity[] {
  const { startLat, startLon } = target;
  if (startLat === undefined || startLon === undefined || target.distanceKm < 1) return [];
  const group = sportGroup(target.typeKey);
  return activities
    .filter(
      (a) =>
        a.startLat !== undefined &&
        a.startLon !== undefined &&
        sportGroup(a.typeKey) === group &&
        Math.abs(a.distanceKm - target.distanceKm) / target.distanceKm <= ROUTE_DISTANCE &&
        haversineM(startLat, startLon, a.startLat, a.startLon) <= ROUTE_START_M,
    )
    .sort((a, b) => a.startLocal.localeCompare(b.startLocal));
}

export interface RouteDelta {
  /** esta vez menos la referencia, en la unidad de `value` (s/km en ritmo, km/h en velocidad) */
  valueDiff?: number;
  /** FC media de esta vez menos la de la referencia (ppm) */
  hrDiff?: number;
}

export interface RouteComparison {
  /** la vez anterior en esta ruta */
  last: RouteDelta & { date: string };
  /** frente a la mediana de las anteriores (las 5 últimas como mucho); solo con 2 o más */
  usual?: RouteDelta & { count: number; since: string };
}

const median = (xs: number[]) => {
  const s = xs.toSorted((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Esta actividad frente a sus veces anteriores en la misma ruta, en dos partes: la vez anterior y tu valor
 * habitual en esa ruta (mediana de las 5 últimas, menos sensible a una vez rara que la media). Es la comparación con
 * "tu normal" del detalle: misma ruta, así que el ritmo y la FC son comparables.
 */
export function routeComparison(
  target: Activity,
  matches: Activity[],
  value: (a: Activity) => number | undefined,
): RouteComparison | undefined {
  const before = matches
    .filter((a) => a.id !== target.id && a.startLocal < target.startLocal)
    .sort((a, b) => a.startLocal.localeCompare(b.startLocal))
    .slice(-5);
  if (!before.length) return undefined;
  const mine = value(target);
  const delta = (ref: number | undefined, mineV: number | undefined) =>
    ref !== undefined && mineV !== undefined && Number.isFinite(ref) ? mineV - ref : undefined;
  const prev = before.at(-1)!;
  const last = { date: prev.date, valueDiff: delta(value(prev), mine), hrDiff: delta(prev.avgHr, target.avgHr) };
  if (before.length < 2) return { last };
  const vals = before.map(value).filter((v): v is number => v !== undefined && Number.isFinite(v));
  const hrs = before.map((a) => a.avgHr).filter((v): v is number => v !== undefined);
  return {
    last,
    usual: {
      count: before.length,
      since: before[0].date,
      valueDiff: delta(vals.length ? median(vals) : undefined, mine),
      hrDiff: delta(hrs.length ? median(hrs) : undefined, target.avgHr),
    },
  };
}
