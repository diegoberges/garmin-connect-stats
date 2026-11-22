/**
 * SOLO DESARROLLO: cliente que sirve las capturas de .data/raw/ (ver /dev/capture) en vez de llamar
 * a Garmin. Se activa con GARMIN_FIXTURES=1 para revisar la UI sin key. Los filtros de fecha se ignoran.
 */
import createClient from 'openapi-fetch';
import { existsSync, readFileSync } from 'node:fs';
import type { paths } from './schema';
import { memoFor } from './client';
import { addDays } from '../dates';

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
  [/\/fitnessage\/v2\//, 'fitness-age'],
];

/** Rango [desde, hasta] de una petición diaria, por query (startDate/endDate) o por ruta (/{from}/{to}). */
function dailyRange(pathname: string, q: URLSearchParams): [string, string] | undefined {
  const from = q.get('startDate');
  const to = q.get('endDate');
  if (from && to) return [from, to];
  const m = pathname.match(/(\d{4}-\d{2}-\d{2})\/(\d{4}-\d{2}-\d{2})$/);
  return m ? [m[1], m[2]] : undefined;
}

/** Repite los elementos capturados en cada día del rango, con su calendarDate reescrita. */
function spread<T extends { calendarDate: string }>(items: T[], [from, to]: [string, string]): T[] {
  if (!items.length) return [];
  const out: T[] = [];
  for (let d = from, i = 0; d <= to; d = addDays(d, 1), i++) out.push({ ...items[i % items.length], calendarDate: d });
  return out;
}

export const fixturesEnabled = () => import.meta.env.DEV && process.env.GARMIN_FIXTURES === '1';

export function createFixtureClient() {
  const client = createClient<paths>({
    baseUrl: 'https://personal.connectapi.garmin.com',
    fetch: async (req: Request) => {
      const { pathname, searchParams } = new URL(req.url);
      let file = ROUTES.find(([re]) => re.test(pathname))?.[1];
      // Búsqueda sin filtro de tipo → la captura con todos los tipos
      if (file === 'activities-running' && !searchParams.has('activityType')) file = 'activities-30d';
      // Historial completo (comparador): la captura + copias de 1 y 2 años antes, paginado como la API
      if (file === 'activities-30d' && searchParams.get('startDate') === '2000-01-01') {
        const base = JSON.parse(readFileSync('.data/raw/activities-30d.json', 'utf8')) as Record<string, unknown>[];
        const shift = (a: Record<string, unknown>, years: number, f: number) => {
          const st = String(a.startTimeLocal);
          return { ...a, activityId: Number(a.activityId) + years, startTimeLocal: `${Number(st.slice(0, 4)) - years}${st.slice(4)}`, distance: Number(a.distance) * f };
        };
        const history = [...base, ...base.map((a) => shift(a, 1, 0.85)), ...base.map((a) => shift(a, 2, 0.7))];
        const start = Number(searchParams.get('start') ?? 0);
        const limit = Number(searchParams.get('limit') ?? 100);
        return new Response(JSON.stringify(history.slice(start, start + limit)), { headers: { 'Content-Type': 'application/json' } });
      }
      // Cualquier descarga de actividad sirve el mismo FIT capturado
      if (/\/download-service\/files\/activity\//.test(pathname)) {
        if (!existsSync('.data/raw/activity-fit.zip')) return new Response(null, { status: 404 });
        return new Response(readFileSync('.data/raw/activity-fit.zip'), { headers: { 'Content-Type': 'application/x-zip-compressed' } });
      }
      if (!file || !existsSync(`.data/raw/${file}.json`)) return new Response('"sin captura"', { status: 404, headers: { 'Content-Type': 'application/json' } });
      const body = readFileSync(`.data/raw/${file}.json`, 'utf8');
      const json = (v: unknown) => new Response(JSON.stringify(v), { headers: { 'Content-Type': 'application/json' } });
      // Series diarias: las capturas tienen 7 días; se repiten desplazando la fecha para cubrir el rango pedido
      const range = dailyRange(pathname, searchParams);
      if (range && file === 'daily-summaries-7d') {
        const src = JSON.parse(body) as { data: { calendarDate: string }[] };
        return json({ ...src, data: spread(src.data, range) });
      }
      if (range && file === 'sleep-7d') return json(spread(JSON.parse(body), range));
      if (range && file === 'hrv-7d') {
        const src = JSON.parse(body) as { hrvSummaries: { calendarDate: string }[] };
        return json({ ...src, hrvSummaries: spread(src.hrvSummaries, range) });
      }
      return new Response(body, { headers: { 'Content-Type': 'application/json' } });
    },
  });
  return Object.assign(client, { memo: memoFor('fixtures') });
}
