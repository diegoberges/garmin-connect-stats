/**
 * Calidad de datos (informe del dashboard, §3.5): actividades que conviene revisar en Garmin Connect
 * porque distorsionan las estadísticas. Son heurísticas sencillas; un aviso no significa que esté mal.
 *  - Duplicada: mismo tipo de deporte, empieza a menos de 5 min de otra y la distancia difiere < 5 %.
 *  - Carrera sin FC: no entra en la carga (TRIMP) ni en la eficiencia.
 *  - GPS: velocidad imposible para el deporte, o distancia 0 con más de 10 min en un deporte con GPS.
 *  - FC: máxima por encima de 220 ppm o media mayor que la máxima.
 */
import type { Activity } from './garmin/types';
import { sportGroup } from './volume';

export type IssueKind = 'duplicate' | 'no-hr' | 'gps' | 'hr';
export const ISSUE_LABELS: Record<IssueKind, string> = {
  duplicate: 'Posible duplicada',
  'no-hr': 'Carrera sin FC',
  gps: 'Posible error de GPS',
  hr: 'FC imposible',
};

export interface DataIssue {
  activity: Activity;
  kind: IssueKind;
  detail: string;
  /** Para duplicadas: la otra actividad. */
  other?: Activity;
}

const DUP_START_S = 5 * 60;
const DUP_DISTANCE = 0.05;
/** Velocidad máxima creíble (km/h) por grupo de deporte. */
const MAX_KMH: Record<string, number> = { run: 25, walk: 12, cycling: 80 };
const INDOOR = /treadmill|indoor|virtual|trainer|elliptical/;

const startSeconds = (a: Activity) => Date.parse(a.startLocal.replace(' ', 'T')) / 1000;

function duplicates(activities: Activity[]): DataIssue[] {
  const sorted = activities.toSorted((a, b) => a.startLocal.localeCompare(b.startLocal));
  const out: DataIssue[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i];
    for (let j = i - 1; j >= 0 && startSeconds(a) - startSeconds(sorted[j]) <= DUP_START_S; j--) {
      const b = sorted[j];
      if (sportGroup(a.typeKey) !== sportGroup(b.typeKey)) continue;
      const maxKm = Math.max(a.distanceKm, b.distanceKm);
      if (maxKm > 0 && Math.abs(a.distanceKm - b.distanceKm) / maxKm > DUP_DISTANCE) continue;
      out.push({ activity: a, other: b, kind: 'duplicate', detail: 'Empieza casi a la vez que otra parecida' });
      break;
    }
  }
  return out;
}

function gpsIssue(a: Activity): DataIssue | undefined {
  const group = sportGroup(a.typeKey);
  const limit = MAX_KMH[group];
  if (limit === undefined || INDOOR.test(a.typeKey)) return undefined;
  if (a.distanceKm === 0 && a.movingS > 10 * 60) {
    return { activity: a, kind: 'gps', detail: 'Distancia 0 con más de 10 min en movimiento' };
  }
  const kmh = a.movingS > 0 ? a.distanceKm / (a.movingS / 3600) : 0;
  if (kmh > limit) {
    return { activity: a, kind: 'gps', detail: `${kmh.toFixed(1).replace('.', ',')} km/h de media` };
  }
  return undefined;
}

function hrIssue(a: Activity): DataIssue | undefined {
  if (a.maxHr && a.maxHr > 220) return { activity: a, kind: 'hr', detail: `FC máxima de ${a.maxHr} ppm` };
  if (a.avgHr && a.maxHr && a.avgHr > a.maxHr) {
    return { activity: a, kind: 'hr', detail: 'FC media mayor que la máxima' };
  }
  return undefined;
}

export function dataIssues(activities: Activity[]): DataIssue[] {
  const out = duplicates(activities);
  for (const a of activities) {
    if (sportGroup(a.typeKey) === 'run' && !a.avgHr) {
      out.push({ activity: a, kind: 'no-hr', detail: 'No cuenta en la carga ni en la eficiencia' });
    }
    const gps = gpsIssue(a);
    if (gps) out.push(gps);
    const hr = hrIssue(a);
    if (hr) out.push(hr);
  }
  return out.sort((x, y) => y.activity.startLocal.localeCompare(x.activity.startLocal));
}
