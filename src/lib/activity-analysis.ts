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
