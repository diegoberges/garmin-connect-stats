/** Formateo en español (es-ES), unidades métricas. */
const nf = (digits: number) =>
  new Intl.NumberFormat('es-ES', { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const DASH = '—';

export function km(value?: number, digits = 1): string {
  return value === undefined ? DASH : nf(digits).format(value);
}

export function int(value?: number): string {
  return value === undefined ? DASH : new Intl.NumberFormat('es-ES').format(Math.round(value));
}

/** 325 → "5:25" (min/km) */
export function pace(secondsPerKm?: number): string {
  if (secondsPerKm === undefined || !Number.isFinite(secondsPerKm)) return DASH;
  const total = Math.round(secondsPerKm);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** 3725 → "1:02:05"; 1500 → "25:00" */
export function duration(seconds?: number): string {
  if (seconds === undefined) return DASH;
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** 27000 → "7 h 30 min" */
export function hoursMinutes(seconds?: number): string {
  if (seconds === undefined) return DASH;
  const m = Math.round(seconds / 60);
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}

const dayFmt = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const shortFmt = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** "2026-11-21" → "sáb, 21 nov" */
export function dayLabel(date: string): string {
  return dayFmt.format(new Date(`${date}T00:00:00Z`));
}

/** "2026-11-21" → "21 nov" */
export function shortDate(date: string): string {
  return shortFmt.format(new Date(`${date}T00:00:00Z`));
}

const TYPE_LABELS: Record<string, string> = {
  running: 'Carrera',
  trail_running: 'Trail',
  treadmill_running: 'Cinta',
  track_running: 'Pista',
  indoor_running: 'Indoor',
  virtual_run: 'Virtual',
  ultra_run: 'Ultra',
};
export const runType = (key: string) => TYPE_LABELS[key] ?? key.replaceAll('_', ' ');

const HRV_STATUS: Record<string, string> = {
  BALANCED: 'Equilibrado',
  UNBALANCED: 'Desequilibrado',
  LOW: 'Bajo',
  POOR: 'Muy bajo',
  NONE: 'Sin estado',
};
export const hrvStatus = (s?: string) => (s ? (HRV_STATUS[s] ?? s) : DASH);

const TE_LABELS: Record<string, string> = {
  RECOVERY: 'Recuperación',
  AEROBIC_BASE: 'Base aeróbica',
  TEMPO: 'Tempo',
  LACTATE_THRESHOLD: 'Umbral',
  VO2MAX: 'VO2máx',
  ANAEROBIC_CAPACITY: 'Anaeróbico',
  SPEED: 'Velocidad',
};
export const trainingEffect = (s?: string) => (s ? (TE_LABELS[s] ?? s) : DASH);
