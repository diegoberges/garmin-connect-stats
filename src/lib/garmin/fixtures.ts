/**
 * SOLO DESARROLLO: cliente que sirve las capturas de .data/raw/ (ver /dev/capture) en vez de llamar
 * a Garmin. Se activa con GARMIN_FIXTURES=1 para revisar la UI sin key. Los filtros de fecha se ignoran.
 */
import createClient from 'openapi-fetch';
import { readFileSync } from 'node:fs';
import type { paths } from './schema';

const ROUTES: [RegExp, string][] = [
  [/\/activities\/search\/activities$/, 'activities-running'],
  [/\/activity-service\/activity\/\d+$/, 'activity-detail'],
  [/\/heartRateZones\//, 'hr-zones'],
  [/\/maxmet\/daily\//, 'vo2max-30d'],
  [/\/v2\/dailysummaries$/, 'daily-summaries-7d'],
  [/\/usersummary\/daily$/, 'daily-summary'],
  [/\/dailySleepSummariesByDate$/, 'sleep-7d'],
  [/\/sleep\/dailySleep$/, 'sleep-today'],
  [/\/hrv\/daily\//, 'hrv-7d'],
  [/\/userprofile\/settings$/, 'profile'],
];

export const fixturesEnabled = () => import.meta.env.DEV && process.env.GARMIN_FIXTURES === '1';

export function createFixtureClient() {
  return createClient<paths>({
    baseUrl: 'https://personal.connectapi.garmin.com',
    fetch: async (req: Request) => {
      const { pathname } = new URL(req.url);
      const file = ROUTES.find(([re]) => re.test(pathname))?.[1];
      if (!file) return new Response('"sin captura"', { status: 404, headers: { 'Content-Type': 'application/json' } });
      return new Response(readFileSync(`.data/raw/${file}.json`), { headers: { 'Content-Type': 'application/json' } });
    },
  });
}
