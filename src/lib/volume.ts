/**
 * Volumen por deporte (sesiones, km, tiempo y desnivel) en la semana y el mes en curso, frente al mismo
 * tramo del periodo anterior (como Runalyze), y el filtro de qué actividades entran en la carga.
 */
import { addDays, weekStart } from './dates';
import type { Activity } from './garmin/types';

export type SportGroup = 'run' | 'walk' | 'cycling' | 'strength' | 'other';
export const SPORT_GROUPS: { group: SportGroup; label: string }[] = [
  { group: 'run', label: 'Carrera' },
  { group: 'walk', label: 'Caminar y senderismo' },
  { group: 'cycling', label: 'Ciclismo' },
  { group: 'strength', label: 'Fuerza' },
  { group: 'other', label: 'Otros' },
];

export function sportGroup(typeKey: string): SportGroup {
  if (/run/.test(typeKey)) return 'run';
  if (/walk|hik|rucking|mountaineering|snow_shoe/.test(typeKey)) return 'walk';
  if (/cycl|bik|ride|bmx|mtb/.test(typeKey)) return 'cycling';
  if (/strength|weight|hiit|crossfit|indoor_cardio/.test(typeKey)) return 'strength';
  return 'other';
}

/** Qué actividades entran en la carga (forma física, fatiga, ratio A:C…). */
export type LoadScope = 'todas' | 'carrera' | 'sin-caminar';
export const LOAD_SCOPES: { scope: LoadScope; label: string }[] = [
  { scope: 'todas', label: 'Todas' },
  { scope: 'sin-caminar', label: 'Sin caminatas' },
  { scope: 'carrera', label: 'Solo carrera' },
];
export const parseLoadScope = (v: string | null): LoadScope =>
  LOAD_SCOPES.some((s) => s.scope === v) ? (v as LoadScope) : 'todas';
export function inLoadScope(scope: LoadScope): (a: Activity) => boolean {
  if (scope === 'carrera') return (a) => sportGroup(a.typeKey) === 'run';
  if (scope === 'sin-caminar') return (a) => sportGroup(a.typeKey) !== 'walk';
  return () => true;
}

export interface Volume {
  sessions: number;
  km: number;
  timeS: number;
  elevationM: number;
}
const empty = (): Volume => ({ sessions: 0, km: 0, timeS: 0, elevationM: 0 });

/** Volumen por grupo de deporte entre dos fechas (incluidas). */
export function volumeBySport(activities: Activity[], from: string, to: string): Map<SportGroup, Volume> {
  const out = new Map<SportGroup, Volume>();
  for (const a of activities) {
    if (a.date < from || a.date > to) continue;
    const g = sportGroup(a.typeKey);
    const v = out.get(g) ?? empty();
    v.sessions += 1;
    v.km += a.distanceKm;
    v.timeS += a.movingS;
    v.elevationM += a.elevationGainM ?? 0;
    out.set(g, v);
  }
  return out;
}

/** Mismo día del mes anterior (sin pasarse de su último día: 31 de marzo → 28/29 de febrero). */
export function sameDayPrevMonth(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const prevY = m === 1 ? y - 1 : y;
  const prevM = m === 1 ? 12 : m - 1;
  const last = new Date(Date.UTC(prevY, prevM, 0)).getUTCDate();
  return `${prevY}-${String(prevM).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

export interface PeriodVolume {
  label: string;
  current: Map<SportGroup, Volume>;
  previous: Map<SportGroup, Volume>;
  /** Fechas, para explicar qué se compara. */
  from: string;
  prevFrom: string;
  prevTo: string;
}

/** Semana y mes en curso hasta hoy, frente al mismo tramo de la semana y el mes anteriores. */
export function periodVolumes(activities: Activity[], today: string): PeriodVolume[] {
  const ws = weekStart(today);
  const elapsed = Math.round((Date.parse(today) - Date.parse(ws)) / 86_400_000);
  const prevWs = addDays(ws, -7);
  const ms = `${today.slice(0, 7)}-01`;
  const prevMs = `${sameDayPrevMonth(ms).slice(0, 7)}-01`;
  const prevMonthTo = sameDayPrevMonth(today);
  return [
    {
      label: 'Semana',
      current: volumeBySport(activities, ws, today),
      previous: volumeBySport(activities, prevWs, addDays(prevWs, elapsed)),
      from: ws,
      prevFrom: prevWs,
      prevTo: addDays(prevWs, elapsed),
    },
    {
      label: 'Mes',
      current: volumeBySport(activities, ms, today),
      previous: volumeBySport(activities, prevMs, prevMonthTo),
      from: ms,
      prevFrom: prevMs,
      prevTo: prevMonthTo,
    },
  ];
}
