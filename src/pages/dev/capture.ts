/**
 * SOLO DESARROLLO: llama a los endpoints de la v1 con la key de la cookie y guarda las
 * respuestas crudas en .data/raw/ (gitignored) para modelar tipos con datos reales.
 * La key nunca se escribe en disco. En producción devuelve 404.
 */
import type { APIRoute } from 'astro';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createGarminClient } from '../../lib/garmin/client';
import { isoDate } from '../../lib/dates';

export const GET: APIRoute = async ({ locals }) => {
  if (!import.meta.env.DEV) return new Response('Not found', { status: 404 });
  const apiKey = locals.settings.garminApiKey;
  if (!apiKey) return new Response('Configura la key en el menú de perfil primero', { status: 400 });

  const day = 86_400_000;
  const today = isoDate();
  const d7 = isoDate(new Date(Date.now() - 7 * day));
  const d30 = isoDate(new Date(Date.now() - 30 * day));
  const yesterday = isoDate(new Date(Date.now() - day));

  const targets: [string, string, Record<string, string | number>?][] = [
    ['profile', '/userprofile-service/userprofile/settings'],
    ['activity-types', '/activity-service/activity/activityTypes/simple'],
    ['activities-running', '/activitylist-service/activities/search/activities', { activityType: 'running', start: 0, limit: 20 }],
    ['activities-30d', '/activitylist-service/activities/search/activities', { startDate: d30, endDate: today, limit: 50 }],
    ['hr-zones', '/biometric-service/heartRateZones/v2'],
    ['vo2max-30d', `/metrics-service/metrics/maxmet/daily/${d30}/${today}`],
    ['daily-summary', '/usersummary-service/usersummary/daily', { calendarDate: yesterday }],
    ['daily-summaries-7d', '/usersummary-service/v2/dailysummaries', { startDate: d7, endDate: today }],
    ['sleep-today', '/sleep-service/sleep/dailySleep', { date: today }],
    ['sleep-7d', '/sleep-service/sleep/dailySleepSummariesByDate', { startDate: d7, endDate: today }],
    ['hrv-7d', `/hrv-service/hrv/daily/${d7}/${today}`],
    ['body-battery-7d', '/wellness-service/wellness/bodyBattery/reports/daily', { startDate: d7, endDate: today }],
    ['stress-7d', `/usersummary-service/stats/stress/daily/${d7}/${today}`],
    ['steps-7d', `/usersummary-service/stats/steps/daily/${d7}/${today}`],
    ['heart-rate-yesterday', '/wellness-service/wellness/dailyHeartRate', { date: yesterday }],
    ['fitness-age', `/fitnessage-service/fitnessage/v2/${today}`],
  ];

  // Llamada sin tipar a propósito: queremos la respuesta tal cual para contrastarla con la spec.
  const client = createGarminClient(apiKey, { fresh: true });
  const rawGet = async (path: string, query?: Record<string, string | number>) => {
    const { data, error, response } = await (client.GET as any)(path, { params: { query } });
    if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(error ?? '')}`.slice(0, 200));
    return data as unknown;
  };

  mkdirSync('.data/raw', { recursive: true });
  const summary: Record<string, string> = {};

  const results = await Promise.all(
    targets.map(async ([name, path, params]) => {
      try {
        return [name, await rawGet(path, params)] as const;
      } catch (err) {
        return [name, { __error: (err as Error).message }] as const;
      }
    }),
  );

  for (const [name, data] of results) {
    writeFileSync(`.data/raw/${name}.json`, JSON.stringify(data, null, 2));
    summary[name] = (data as { __error?: string })?.__error ?? 'ok';
  }

  // Detalle de la carrera más reciente, si la hay
  const running = results.find(([n]) => n === 'activities-running')?.[1];
  const first = Array.isArray(running) ? (running[0] as { activityId?: number }) : undefined;
  if (first?.activityId) {
    try {
      const detail = await rawGet(`/activity-service/activity/${first.activityId}`);
      writeFileSync('.data/raw/activity-detail.json', JSON.stringify(detail, null, 2));
      summary['activity-detail'] = 'ok';
    } catch (err) {
      summary['activity-detail'] = (err as Error).message;
    }
    // Archivo original (ZIP con el .FIT): de aquí salen el recorrido GPS y las series por segundo
    try {
      const { data, response } = await (client.GET as any)('/download-service/files/activity/{activityId}', {
        params: { path: { activityId: first.activityId } },
        parseAs: 'arrayBuffer',
      });
      if (!response.ok) throw new Error(String(response.status));
      writeFileSync('.data/raw/activity-fit.zip', Buffer.from(data as ArrayBuffer));
      summary['activity-fit'] = `ok (${response.headers.get('content-type')})`;
    } catch (err) {
      summary['activity-fit'] = (err as Error).message;
    }
  }

  return new Response(JSON.stringify({ guardado_en: '.data/raw/', resultados: summary }, null, 2), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
