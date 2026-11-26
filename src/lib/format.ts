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
  if (m < 60) return `${m} min`;
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
  indoor_running: 'Carrera indoor',
  street_running: 'Carrera urbana',
  virtual_run: 'Carrera virtual',
  ultra_run: 'Ultra',
  obstacle_run: 'Carrera de obstáculos',
  walking: 'Caminar',
  casual_walking: 'Paseo',
  speed_walking: 'Marcha rápida',
  hiking: 'Senderismo',
  mountaineering: 'Montañismo',
  rucking: 'Rucking',
  cycling: 'Ciclismo',
  road_biking: 'Ciclismo en carretera',
  mountain_biking: 'BTT',
  gravel_cycling: 'Gravel',
  indoor_cycling: 'Ciclismo indoor',
  virtual_ride: 'Ciclismo virtual',
  e_bike_fitness: 'E-bike',
  e_bike_mountain: 'E-MTB',
  swimming: 'Natación',
  lap_swimming: 'Natación en piscina',
  open_water_swimming: 'Aguas abiertas',
  strength_training: 'Fuerza',
  hiit: 'HIIT',
  yoga: 'Yoga',
  pilates: 'Pilates',
  mobility: 'Movilidad',
  breathwork: 'Respiración',
  meditation: 'Meditación',
  indoor_cardio: 'Cardio',
  elliptical: 'Elíptica',
  stair_climbing: 'Escaleras',
  indoor_rowing: 'Remo indoor',
  rowing_v2: 'Remo',
  jump_rope: 'Comba',
  indoor_climbing: 'Escalada indoor',
  bouldering: 'Búlder',
  rock_climbing: 'Escalada',
  tennis_v2: 'Tenis',
  padel: 'Pádel',
  paddelball: 'Pádel',
  soccer: 'Fútbol',
  basketball: 'Baloncesto',
  golf: 'Golf',
  resort_skiing: 'Esquí',
  cross_country_skiing_ws: 'Esquí de fondo',
  stand_up_paddleboarding_v2: 'Paddle surf',
  surfing_v2: 'Surf',
  multi_sport: 'Multideporte',
  other: 'Otro',
};
/** Nombre en español del tipo de actividad de Garmin ("strength_training" → "Fuerza"). */
export function activityLabel(key: string): string {
  if (TYPE_LABELS[key]) return TYPE_LABELS[key];
  const text = key.replace(/_v\d+$|_ws$/, '').replaceAll('_', ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** 28.34 → "28,3" (km/h) */
export const speed = (kmh?: number) => km(kmh);

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
