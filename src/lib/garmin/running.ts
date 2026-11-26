import { unwrap, type GarminClient } from './client';
import { BEST_EFFORT_DISTANCES } from './types';
import type { ActivityExtra, ApiActivity, ApiHrZones, ApiVo2, HrZones, Activity, Vo2Point } from './types';

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const PAGE = 100;

export function mapActivity(a: ApiActivity): Activity {
  const distanceKm = (num(a.distance) ?? 0) / 1000;
  const movingS = num(a.movingDuration) ?? num(a.duration) ?? 0;
  const startLocal = a.startTimeLocal ?? '';
  return {
    id: num(a.activityId) ?? 0,
    name: a.activityName ?? 'Actividad',
    typeKey: a.activityType?.typeKey ?? 'running',
    startLocal,
    date: startLocal.slice(0, 10),
    distanceKm,
    durationS: num(a.duration) ?? 0,
    movingS,
    elapsedS: num(a.elapsedDuration),
    paceSPerKm: distanceKm > 0.05 && movingS > 0 ? movingS / distanceKm : undefined,
    avgHr: num(a.averageHR),
    maxHr: num(a.maxHR),
    elevationGainM: num(a.elevationGain),
    cadenceSpm: num(a.averageRunningCadenceInStepsPerMinute),
    aerobicTE: num(a.aerobicTrainingEffect),
    anaerobicTE: num(a.anaerobicTrainingEffect),
    trainingLoad: num(a.activityTrainingLoad),
    trainingEffectLabel: a.trainingEffectLabel ?? undefined,
    // La búsqueda lo devuelve como `eventType` aunque la spec lo llame `eventTypeDTO` en otros esquemas
    eventTypeKey: (a as { eventType?: { typeKey?: string } | null }).eventType?.typeKey ?? undefined,
    hrZonesS: [a.hrTimeInZone_1, a.hrTimeInZone_2, a.hrTimeInZone_3, a.hrTimeInZone_4, a.hrTimeInZone_5].map(
      (z) => num(z) ?? 0,
    ),
    calories: num(a.calories),
    isPr: a.pr === true,
    startLat: num(a.startLatitude),
    startLon: num(a.startLongitude),
    bestEfforts: Object.fromEntries(
      BEST_EFFORT_DISTANCES.map((m) => [m, num((a as Record<string, unknown>)[`fastestSplit_${m}`])]).filter(
        ([, s]) => s !== undefined,
      ),
    ),
  };
}

/** Carreras (incluye trail/cinta: el filtro `running` es el tipo padre) entre dos fechas. */
export const getRuns = (client: GarminClient, startDate: string, endDate: string) =>
  getActivities(client, startDate, endDate, 'running');

/** Desde cuándo se buscan carreras para el histórico (Garmin Connect no tiene datos anteriores). */
const HISTORY_START = '2000-01-01';
const HISTORY_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * Todas las carreras del historial. Son varias páginas de 100, así que se guardan 6 h por usuario;
 * para marcas recientes, el periodo visible se calcula aparte y siempre está al día.
 */
export const getAllRuns = (client: GarminClient, today: string) =>
  client.memo(`all-runs`, HISTORY_TTL_MS, () => getRuns(client, HISTORY_START, today));

/** Todo el historial de actividades (cualquier tipo), 6 h en memoria por usuario. Para comparar años. */
export const getAllActivities = (client: GarminClient, today: string) =>
  client.memo(`all-activities`, HISTORY_TTL_MS, () => getActivities(client, HISTORY_START, today));

/** ¿Marcada como competición en Garmin Connect? */
export const isRace = (a: Pick<Activity, 'eventTypeKey'>) => a.eventTypeKey === 'race';

/**
 * Actividades marcadas como competición (tipo de evento "race" en Garmin Connect), de cualquier deporte.
 * Se pide con `eventType=race`, pero la API puede ignorar el filtro y devolverlo todo: se filtra también aquí.
 */
export const getRaces = (client: GarminClient, today: string) =>
  client.memo(`races`, HISTORY_TTL_MS, async () =>
    (await getActivities(client, HISTORY_START, today, undefined, 'race')).filter(isRace),
  );

/** Actividades entre dos fechas (todas, o solo un tipo/tipo padre de Garmin), paginando, más recientes primero. */
export async function getActivities(
  client: GarminClient,
  startDate: string,
  endDate: string,
  activityType?: string,
  eventType?: string,
): Promise<Activity[]> {
  const all: Activity[] = [];
  for (let start = 0; ; start += PAGE) {
    const page = await unwrap(
      client.GET('/activitylist-service/activities/search/activities', {
        params: {
          query: {
            ...(activityType ? { activityType } : {}),
            ...(eventType ? { eventType } : {}),
            startDate,
            endDate,
            start,
            limit: PAGE,
          },
        },
      }),
    );
    const list = (Array.isArray(page) ? page : []) as ApiActivity[];
    all.push(...list.map(mapActivity));
    if (list.length < PAGE) break;
  }
  return all.sort((a, b) => b.startLocal.localeCompare(a.startLocal));
}

/** El listado ya trae todo lo que usamos; el detalle no aporta zonas ni splits por km. */
export async function getActivity(
  client: GarminClient,
  id: number,
): Promise<(Activity & { extra: ActivityExtra }) | undefined> {
  const detail = await unwrap(
    client.GET('/activity-service/activity/{activityId}', { params: { path: { activityId: id } } }),
  );
  const s = detail.summaryDTO;
  const date = s?.startTimeLocal?.slice(0, 10);
  if (!s || !date) return undefined;
  // Las zonas de FC solo vienen en el listado: buscamos la actividad en su día.
  const sameDay = await getActivities(client, date, date);
  const activity = sameDay.find((r) => r.id === id);
  if (!activity) return undefined;
  return {
    ...activity,
    // El detalle trae su propia marca; vale cualquiera de las dos
    isPr: activity.isPr || detail.metadataDTO?.personalRecord === true,
    extra: {
      elevationLossM: num(s.elevationLoss),
      minElevationM: num(s.minElevation),
      maxElevationM: num(s.maxElevation),
      maxSpeed: num(s.maxSpeed),
      minHr: num(s.minHR),
      temperatureC: num(s.averageTemperature),
      steps: num(s.steps),
      strideLengthCm: num(s.strideLength),
      groundContactMs: num(s.groundContactTime),
      verticalOscillationCm: num(s.verticalOscillation),
      verticalRatio: num(s.verticalRatio),
      respirationRate: num(s.avgRespirationRate),
      maxCadence: num(s.maxRunCadence),
      // Garmin guarda el RPE ×10 (10–100)
      rpe: num(s.directWorkoutRpe) === undefined ? undefined : num(s.directWorkoutRpe)! / 10,
      feel: num(s.directWorkoutFeel),
      avgPower: num(s.averagePower),
      normPower: num(s.normalizedPower),
      maxPower: num(s.maxPower),
    },
  };
}

/** Zonas de FC del deporte indicado (Garmin las define por deporte), con las genéricas como respaldo. */
export async function getHrZones(
  client: GarminClient,
  sport: 'RUNNING' | 'CYCLING' | 'SWIMMING' = 'RUNNING',
): Promise<HrZones | undefined> {
  const data = (await unwrap(client.GET('/biometric-service/heartRateZones/v2', {}))) as ApiHrZones;
  const list = Array.isArray(data) ? data : [];
  const z = list.find((x) => x.sport === sport) ?? list.find((x) => x.sport === 'DEFAULT') ?? list[0];
  if (!z) return undefined;
  return {
    floors: [z.zone1Floor, z.zone2Floor, z.zone3Floor, z.zone4Floor, z.zone5Floor].map((v) => num(v) ?? 0),
    maxHr: num(z.maxHeartRateUsed),
    restingHr: num(z.restingHeartRateUsed),
  };
}

/**
 * FC en reposo y máxima para el TRIMP de Banister: las de la configuración de zonas general de Garmin
 * (no por deporte). Son las de hoy: no hay histórico de zonas, así que se aplican a todas las fechas.
 */
export async function getHrReference(client: GarminClient): Promise<{ restingHr: number; maxHr: number } | undefined> {
  const data = (await unwrap(client.GET('/biometric-service/heartRateZones/v2', {}))) as ApiHrZones;
  const list = Array.isArray(data) ? data : [];
  const z = list.find((x) => x.sport === 'DEFAULT') ?? list[0];
  const restingHr = num(z?.restingHeartRateUsed);
  const maxHr = num(z?.maxHeartRateUsed);
  return restingHr && maxHr && maxHr > restingHr ? { restingHr, maxHr } : undefined;
}

export async function getVo2Max(client: GarminClient, startDate: string, endDate: string): Promise<Vo2Point[]> {
  const data = (await unwrap(
    client.GET('/metrics-service/metrics/maxmet/daily/{startDate}/{endDate}', {
      params: { path: { startDate, endDate } },
    }),
  )) as ApiVo2;
  return (Array.isArray(data) ? data : [])
    .map((d) => {
      const g = d.generic;
      const value = num(g?.vo2MaxPreciseValue) ?? num(g?.vo2MaxValue);
      return g?.calendarDate && value !== undefined ? { date: g.calendarDate, value } : undefined;
    })
    .filter((x): x is Vo2Point => Boolean(x));
}
