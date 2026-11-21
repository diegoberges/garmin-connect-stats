/**
 * Comprobación de conexión: llama a varios endpoints reales y resume qué responde.
 */
import { addDays, isoDate } from '../dates';
import { getAccessToken } from './auth';
import { createGarminClient, unwrap } from './client';
import { getRuns } from './running';

export { isoDate };

export interface CheckResult {
  name: string;
  endpoint: string;
  ok: boolean;
  ms: number;
  detail?: string;
  error?: string;
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const hm = (seconds?: number) =>
  seconds === undefined ? '—' : `${Math.floor(seconds / 3600)} h ${Math.round((seconds % 3600) / 60)} min`;

async function run(name: string, endpoint: string, fn: () => Promise<string>): Promise<CheckResult> {
  const t0 = Date.now();
  try {
    const detail = await fn();
    return { name, endpoint, ok: true, ms: Date.now() - t0, detail };
  } catch (err) {
    return { name, endpoint, ok: false, ms: Date.now() - t0, error: (err as Error).message };
  }
}

export async function runDiagnostics(apiKey: string, { fresh = false } = {}): Promise<CheckResult[]> {
  const today = isoDate();
  const yesterday = addDays(today, -1);

  // El token primero: si falla, el resto no tiene sentido.
  const token = await run('Token de acceso', 'POST /personalapitoken-service/…/token', async () => {
    await getAccessToken(apiKey, { force: fresh });
    return 'Token obtenido';
  });
  if (!token.ok) return [token];

  const client = createGarminClient(apiKey, { fresh });

  const checks = await Promise.all([
    run('Perfil', 'GET /userprofile-service/userprofile/settings', async () => {
      const p = await unwrap(client.GET('/userprofile-service/userprofile/settings', {}));
      return [p.displayName, p.timeZone, p.measurementSystem].filter(Boolean).join(' · ') || 'Respuesta vacía';
    }),
    run('Última carrera', 'GET /activitylist-service/activities/search/activities', async () => {
      const [a] = await getRuns(client, addDays(today, -60), today);
      if (!a) return 'Sin carreras en los últimos 60 días';
      return [a.name, a.startLocal, `${a.distanceKm.toFixed(2)} km`].join(' · ');
    }),
    run('Resumen diario (ayer)', 'GET /usersummary-service/usersummary/daily', async () => {
      const d = await unwrap(
        client.GET('/usersummary-service/usersummary/daily', { params: { query: { calendarDate: yesterday } } }),
      );
      return `${num(d.totalSteps) ?? '—'} pasos · FC reposo ${num(d.restingHeartRate) ?? '—'} ppm · estrés medio ${num(d.averageStressLevel) ?? '—'}`;
    }),
    run('Sueño (anoche)', 'GET /sleep-service/sleep/dailySleep', async () => {
      const s = await unwrap(client.GET('/sleep-service/sleep/dailySleep', { params: { query: { date: today } } }));
      return `${hm(num(s.sleepTimeSeconds))} · profundo ${hm(num(s.deepSleepSeconds))} · REM ${hm(num(s.remSleepSeconds))}`;
    }),
    run('HRV (últimos 7 días)', 'GET /hrv-service/hrv/daily/{fromDate}/{toDate}', async () => {
      const res = await unwrap(
        client.GET('/hrv-service/hrv/daily/{fromDate}/{toDate}', {
          params: { path: { fromDate: addDays(today, -7), toDate: today } },
        }),
      );
      return `${res.hrvSummaries?.length ?? 0} días con datos`;
    }),
  ]);

  return [token, ...checks];
}
