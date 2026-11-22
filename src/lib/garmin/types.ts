/**
 * Tipos de la API derivados de la spec OpenAPI (schema.d.ts, generado) + tipos de dominio de la app.
 *
 * Desviaciones conocidas entre la spec y las respuestas reales (comprobado con capturas reales):
 *  - Muchos campos llegan como `null` aunque la spec no los marca nullable → `Nullable<>` en mapeadores.
 *  - sleep*Timestamp* llegan como epoch ms (number), la spec dice string.
 *  - bodyBatteryValuesArray / heartRateValues son tuplas [epochMs, valor], la spec dice object.
 *  - Hay campos extra no documentados (se ignoran).
 *  - /fitnessage-service/fitnessage/v2/{date} devuelve un objeto, la spec dice lista.
 */
import type { paths } from './schema';

/** Cuerpo JSON de la respuesta 200 de un GET de la spec. */
export type ApiJson<P extends keyof paths> = paths[P] extends {
  get: { responses: { 200: { content: { 'application/json': infer R } } } };
}
  ? R
  : never;

type Item<T> = T extends readonly (infer U)[] ? U : T;
/** La spec no declara nullable, pero la realidad sí: todo campo puede faltar o ser null. */
export type Loose<T> = { [K in keyof T]?: T[K] | null };

export type ApiActivity = Loose<Item<ApiJson<'/activitylist-service/activities/search/activities'>>>;
export type ApiActivityDetail = ApiJson<'/activity-service/activity/{activityId}'>;
export type ApiDailySummaries = ApiJson<'/usersummary-service/v2/dailysummaries'>;
export type ApiSleep = Item<ApiJson<'/sleep-service/sleep/dailySleepSummariesByDate'>>;
export type ApiHrv = ApiJson<'/hrv-service/hrv/daily/{fromDate}/{toDate}'>;
export type ApiHrZones = ApiJson<'/biometric-service/heartRateZones/v2'>;
export type ApiVo2 = ApiJson<'/metrics-service/metrics/maxmet/daily/{startDate}/{endDate}'>;

// ---------- Dominio ----------

export interface Activity {
  id: number;
  name: string;
  typeKey: string; // running, trail_running, treadmill_running…
  startLocal: string; // "YYYY-MM-DD HH:mm:ss" hora local
  date: string; // YYYY-MM-DD
  distanceKm: number;
  durationS: number;
  movingS: number;
  /** Tiempo total, con las pausas (el que cuenta en una competición, como en Strava). */
  elapsedS?: number;
  /** segundos por km (sobre tiempo en movimiento) */
  paceSPerKm?: number;
  avgHr?: number;
  maxHr?: number;
  elevationGainM?: number;
  cadenceSpm?: number;
  aerobicTE?: number;
  anaerobicTE?: number;
  trainingLoad?: number;
  trainingEffectLabel?: string;
  /** segundos en zonas 1..5 */
  hrZonesS: number[];
  calories?: number;
  /** mejor tiempo (s) en cada distancia estándar dentro de la actividad, según Garmin */
  bestEfforts: Partial<Record<BestEffortDistance, number>>;
  /** Garmin marcó la actividad como récord personal (no dice cuál) */
  isPr: boolean;
  /** Punto de salida (para encontrar actividades en la misma ruta) */
  startLat?: number;
  startLon?: number;
}

export const BEST_EFFORT_DISTANCES = [1000, 1609, 5000, 10000, 21098, 42195] as const;
export type BestEffortDistance = (typeof BEST_EFFORT_DISTANCES)[number];

/** Métricas extra del detalle de una actividad (summaryDTO); todas opcionales según deporte y sensores. */
export interface ActivityExtra {
  elevationLossM?: number;
  minElevationM?: number;
  maxElevationM?: number;
  /** m/s */
  maxSpeed?: number;
  minHr?: number;
  temperatureC?: number;
  steps?: number;
  /** cm */
  strideLengthCm?: number;
  /** ms */
  groundContactMs?: number;
  /** cm */
  verticalOscillationCm?: number;
  /** % */
  verticalRatio?: number;
  /** respiraciones/min */
  respirationRate?: number;
  maxCadence?: number;
  /** Esfuerzo percibido 1–10 y sensación 0–100 que se anotan en el reloj o en Garmin Connect */
  rpe?: number;
  feel?: number;
  /** W (solo con sensor de potencia) */
  avgPower?: number;
  normPower?: number;
  maxPower?: number;
}

export interface DayHealth {
  date: string;
  steps?: number;
  stepGoal?: number;
  restingHr?: number;
  stressAvg?: number;
  bodyBatteryMin?: number;
  bodyBatteryMax?: number;
  bodyBatteryCharged?: number;
  bodyBatteryDrained?: number;
  sleepS?: number;
  deepS?: number;
  lightS?: number;
  remS?: number;
  awakeS?: number;
  sleepScore?: number;
  hrvLastNight?: number;
  hrvWeeklyAvg?: number;
  hrvStatus?: string;
  /** minutos de intensidad del día (Garmin cuenta los vigorosos ×2 en su total) */
  intensityModerate?: number;
  intensityVigorous?: number;
  /** respiraciones/min medias durante el sueño */
  sleepRespiration?: number;
  /** necesidad de sueño calculada por Garmin para esa noche (s) */
  sleepNeedS?: number;
  /** estrés medio durante el sueño (activación nocturna) */
  sleepStress?: number;
  /** inicio y fin del sueño, epoch ms en hora local */
  sleepStartLocal?: number;
  sleepEndLocal?: number;
}

export interface HrZones {
  /** límite inferior de Z1..Z5 en ppm */
  floors: number[];
  maxHr?: number;
  restingHr?: number;
}

export interface Vo2Point {
  date: string;
  value: number;
}

/** Perfil para el menú de usuario. Nombre y foto no están en /userprofile: salen del dueño de la última actividad. */
export interface UserProfile {
  displayName?: string;
  fullName?: string;
  imageUrl?: string;
  timeZone?: string;
  /** La llamada al perfil sirve de prueba de conexión: undefined = OK, texto = motivo del fallo. */
  connectionError?: string;
}
