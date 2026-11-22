/**
 * Tipos de la API derivados de la spec OpenAPI (schema.d.ts, generado) + tipos de dominio de la app.
 *
 * Desviaciones conocidas entre la spec y las respuestas reales (comprobado con capturas reales):
 *  - Muchos campos llegan como `null` aunque la spec no los marca nullable → `Nullable<>` en mapeadores.
 *  - sleep*Timestamp* llegan como epoch ms (number), la spec dice string.
 *  - bodyBatteryValuesArray / heartRateValues son tuplas [epochMs, valor], la spec dice object.
 *  - Hay campos extra no documentados (se ignoran).
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

export interface RunActivity {
  id: number;
  name: string;
  typeKey: string; // running, trail_running, treadmill_running…
  startLocal: string; // "YYYY-MM-DD HH:mm:ss" hora local
  date: string; // YYYY-MM-DD
  distanceKm: number;
  durationS: number;
  movingS: number;
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
  age?: number;
  fitnessAge?: number;
  /** La llamada al perfil sirve de prueba de conexión: undefined = OK, texto = motivo del fallo. */
  connectionError?: string;
}
