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

/** Salud diaria combinando resúmenes (pasos, FC reposo, estrés, Body Battery), sueño y HRV. */
export async function getDailyHealth(client: GarminClient, from: string, to: string): Promise<DayHealth[]> {
  const [summaries, sleeps, hrvs] = await Promise.all([
    inChunks(from, to, async (startDate, endDate) => {
      const res = (await unwrap(
        client.GET('/usersummary-service/v2/dailysummaries', { params: { query: { startDate, endDate } } }),
      )) as ApiDailySummaries;
      return res?.data ?? [];
    }),
    inChunks(from, to, async (startDate, endDate) => {
      const res = await unwrap(
        client.GET('/sleep-service/sleep/dailySleepSummariesByDate', { params: { query: { startDate, endDate } } }),
      );
      return (Array.isArray(res) ? res : []) as ApiSleep[];
    }),
    inChunks(from, to, async (fromDate, toDate) => {
      const res = (await unwrap(
        client.GET('/hrv-service/hrv/daily/{fromDate}/{toDate}', { params: { path: { fromDate, toDate } } }),
      )) as ApiHrv;
      return res?.hrvSummaries ?? [];
    }),
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
