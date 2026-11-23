import { chunkRange, dateRange } from '../dates';
import { unwrap, type GarminClient } from './client';
import type { ApiDailySummaries, ApiHrv, ApiSleep, DayHealth } from './types';

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** Ventana por petición. Garmin no documenta el máximo; 28 días es prudente y probado con 7. */
const CHUNK_DAYS = 28;

async function inChunks<T>(from: string, to: string, fn: (s: string, e: string) => Promise<T[]>): Promise<T[]> {
  const parts = await Promise.all(chunkRange(from, to, CHUNK_DAYS).map(([s, e]) => fn(s, e)));
  return parts.flat();
}

const fetchSummaries = (client: GarminClient, from: string, to: string) =>
  inChunks(from, to, async (startDate, endDate) => {
    const res = (await unwrap(
      client.GET('/usersummary-service/v2/dailysummaries', { params: { query: { startDate, endDate } } }),
    )) as ApiDailySummaries;
    return res?.data ?? [];
  });

const fetchSleeps = (client: GarminClient, from: string, to: string) =>
  inChunks(from, to, async (startDate, endDate) => {
    const res = await unwrap(
      client.GET('/sleep-service/sleep/dailySleepSummariesByDate', { params: { query: { startDate, endDate } } }),
    );
    return (Array.isArray(res) ? res : []) as ApiSleep[];
  });

const fetchHrvs = (client: GarminClient, from: string, to: string) =>
  inChunks(from, to, async (fromDate, toDate) => {
    const res = (await unwrap(
      client.GET('/hrv-service/hrv/daily/{fromDate}/{toDate}', { params: { path: { fromDate, toDate } } }),
    )) as ApiHrv;
    return res?.hrvSummaries ?? [];
  });

/** Salud diaria combinando resúmenes (pasos, FC reposo, estrés, Body Battery), sueño y HRV. */
export async function getDailyHealth(client: GarminClient, from: string, to: string): Promise<DayHealth[]> {
  const [summaries, sleeps, hrvs] = await Promise.all([
    fetchSummaries(client, from, to),
    fetchSleeps(client, from, to),
    fetchHrvs(client, from, to),
  ]);

  const byDate = new Map<string, DayHealth>(dateRange(from, to).map((d) => [d, { date: d }]));

  for (const s of summaries) {
    const day = s.calendarDate && byDate.get(s.calendarDate);
    if (!day) continue;
    day.steps = num(s.movement?.steps?.value);
    day.stepGoal = num(s.movement?.steps?.goal);
    day.restingHr = num(s.heartRate?.restingValue);
    day.stressAvg = num(s.stress?.avgLevel);
    day.bodyBatteryMin = num(s.bodyBattery?.minValue);
    day.bodyBatteryMax = num(s.bodyBattery?.maxValue);
    day.bodyBatteryCharged = num(s.bodyBattery?.chargedValue);
    day.bodyBatteryDrained = num(s.bodyBattery?.drainedValue);
    day.intensityModerate = num(s.intensityMinutes?.moderate);
    day.intensityVigorous = num(s.intensityMinutes?.vigorous);
  }
  for (const s of sleeps) {
    const day = s.calendarDate && byDate.get(s.calendarDate);
    if (!day) continue;
    day.sleepS = num(s.sleepTimeSeconds);
    day.deepS = num(s.deepSleepSeconds);
    day.lightS = num(s.lightSleepSeconds);
    day.remS = num(s.remSleepSeconds);
    day.awakeS = num(s.awakeSleepSeconds);
    day.sleepScore = num(s.sleepScores?.overall?.value);
    day.sleepRespiration = num(s.averageRespirationValue);
    day.sleepStress = num(s.avgSleepStress);
    const needMin = num(s.sleepNeed?.actual) ?? num(s.sleepNeed?.baseline);
    day.sleepNeedS = needMin !== undefined ? needMin * 60 : undefined;
    // La spec dice string; la API real devuelve epoch ms (ver types.ts)
    day.sleepStartLocal = num(s.sleepStartTimestampLocal as unknown);
    day.sleepEndLocal = num(s.sleepEndTimestampLocal as unknown);
  }
  for (const h of hrvs) {
    const day = h.calendarDate && byDate.get(h.calendarDate);
    if (!day) continue;
    day.hrvLastNight = num(h.lastNightAvg);
    day.hrvWeeklyAvg = num(h.weeklyAvg);
    day.hrvStatus = h.status ?? undefined;
  }

  return [...byDate.values()];
}

const HISTORY_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * FC en reposo y VFC de un rango largo (12 meses): solo los resúmenes y la VFC, sin el sueño, para pedir
 * menos. Se guarda 6 h: son tendencias lentas.
 */
export function getHeartHistory(client: GarminClient, from: string, to: string): Promise<DayHealth[]> {
  return client.memo(`heart:${from}:${to}`, HISTORY_TTL_MS, async () => {
    const [summaries, hrvs] = await Promise.all([fetchSummaries(client, from, to), fetchHrvs(client, from, to)]);
    const byDate = new Map<string, DayHealth>(dateRange(from, to).map((d) => [d, { date: d }]));
    for (const s of summaries) {
      const day = s.calendarDate && byDate.get(s.calendarDate);
      if (day) day.restingHr = num(s.heartRate?.restingValue);
    }
    for (const h of hrvs) {
      const day = h.calendarDate && byDate.get(h.calendarDate);
      if (day) day.hrvLastNight = num(h.lastNightAvg);
    }
    return [...byDate.values()];
  });
}

/** Peso diario (kg). Garmin lo da en gramos; si llega un valor que ya parece kg, se respeta. */
export async function getWeights(
  client: GarminClient,
  from: string,
  to: string,
): Promise<{ date: string; kg: number }[]> {
  const res = (await unwrap(
    client.GET('/weight-service/weight/range/{startDate}/{endDate}', {
      params: { path: { startDate: from, endDate: to } },
    }),
  )) as { dailyWeightSummaries?: { summaryDate?: string; latestWeight?: { weight?: number } | null }[] } | undefined;
  return (res?.dailyWeightSummaries ?? [])
    .map((d) => {
      const w = num(d.latestWeight?.weight);
      if (!d.summaryDate || w === undefined || w <= 0) return undefined;
      return { date: d.summaryDate, kg: w > 500 ? w / 1000 : w };
    })
    .filter((x): x is { date: string; kg: number } => x !== undefined)
    .sort((a, b) => a.date.localeCompare(b.date));
}
