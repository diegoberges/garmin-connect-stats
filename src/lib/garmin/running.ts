import { unwrap, type GarminClient } from './client';
import type { ApiActivity, ApiHrZones, ApiVo2, HrZones, RunActivity, Vo2Point } from './types';

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const PAGE = 100;

export function mapActivity(a: ApiActivity): RunActivity {
  const distanceKm = (num(a.distance) ?? 0) / 1000;
  const movingS = num(a.movingDuration) ?? num(a.duration) ?? 0;
  const startLocal = a.startTimeLocal ?? '';
  return {
    id: num(a.activityId) ?? 0,
    name: a.activityName ?? 'Carrera',
    typeKey: a.activityType?.typeKey ?? 'running',
    startLocal,
    date: startLocal.slice(0, 10),
    distanceKm,
    durationS: num(a.duration) ?? 0,
    movingS,
    paceSPerKm: distanceKm > 0.05 && movingS > 0 ? movingS / distanceKm : undefined,
    avgHr: num(a.averageHR),
    maxHr: num(a.maxHR),
    elevationGainM: num(a.elevationGain),
    cadenceSpm: num(a.averageRunningCadenceInStepsPerMinute),
    aerobicTE: num(a.aerobicTrainingEffect),
    anaerobicTE: num(a.anaerobicTrainingEffect),
    trainingLoad: num(a.activityTrainingLoad),
    trainingEffectLabel: a.trainingEffectLabel ?? undefined,
    hrZonesS: [a.hrTimeInZone_1, a.hrTimeInZone_2, a.hrTimeInZone_3, a.hrTimeInZone_4, a.hrTimeInZone_5].map(
      (z) => num(z) ?? 0,
    ),
    calories: num(a.calories),
  };
}

/** Carreras (incluye trail/cinta: el filtro `running` es el tipo padre) entre dos fechas, paginando. */
export async function getRuns(client: GarminClient, startDate: string, endDate: string): Promise<RunActivity[]> {
  const all: RunActivity[] = [];
  for (let start = 0; ; start += PAGE) {
    const page = await unwrap(
      client.GET('/activitylist-service/activities/search/activities', {
        params: { query: { activityType: 'running', startDate, endDate, start, limit: PAGE } },
      }),
    );
    const list = (Array.isArray(page) ? page : []) as ApiActivity[];
    all.push(...list.map(mapActivity));
    if (list.length < PAGE) break;
  }
  return all.sort((a, b) => b.startLocal.localeCompare(a.startLocal));
}

/** El listado ya trae todo lo que usamos; el detalle no aporta zonas ni splits por km. */
export async function getRun(client: GarminClient, id: number): Promise<RunActivity | undefined> {
  const detail = await unwrap(
    client.GET('/activity-service/activity/{activityId}', { params: { path: { activityId: id } } }),
  );
  const date = detail.summaryDTO?.startTimeLocal?.slice(0, 10);
  if (!date) return undefined;
  // Las zonas de FC solo vienen en el listado: buscamos la actividad en su día.
  const sameDay = await getRuns(client, date, date);
  return sameDay.find((r) => r.id === id);
}

export async function getHrZones(client: GarminClient): Promise<HrZones | undefined> {
  const data = (await unwrap(client.GET('/biometric-service/heartRateZones/v2', {}))) as ApiHrZones;
  const list = Array.isArray(data) ? data : [];
  const z = list.find((x) => x.sport === 'RUNNING') ?? list.find((x) => x.sport === 'DEFAULT') ?? list[0];
  if (!z) return undefined;
  return {
    floors: [z.zone1Floor, z.zone2Floor, z.zone3Floor, z.zone4Floor, z.zone5Floor].map((v) => num(v) ?? 0),
    maxHr: num(z.maxHeartRateUsed),
    restingHr: num(z.restingHeartRateUsed),
  };
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
