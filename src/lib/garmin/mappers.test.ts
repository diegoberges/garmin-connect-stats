/**
 * Comprueba los mapeadores contra respuestas reales capturadas en .data/raw/ (vía /dev/capture).
 * Las capturas son datos personales y no se versionan: si no existen, el test se salta.
 */
import { existsSync, readFileSync } from 'node:fs';
import createClient from 'openapi-fetch';
import { describe, expect, it } from 'vitest';
import type { paths } from './schema';
import { memoFor } from './client';
import { getHrZones, getRuns, getVo2Max, mapActivity } from './running';
import { getDailyHealth } from './wellness';

const RAW = '.data/raw';
const has = existsSync(`${RAW}/activities-running.json`);
const raw = (name: string) => JSON.parse(readFileSync(`${RAW}/${name}.json`, 'utf8'));

/** Cliente con la misma forma que el real, pero que sirve las capturas según la ruta. */
const baseClient = createClient<paths>({
  baseUrl: 'https://personal.connectapi.garmin.com',
  fetch: async (req: Request) => {
    const { pathname } = new URL(req.url);
    const file = pathname.includes('/activities/search/activities')
      ? 'activities-running'
      : pathname.includes('/heartRateZones') ? 'hr-zones'
      : pathname.includes('/maxmet/') ? 'vo2max-30d'
      : pathname.includes('/v2/dailysummaries') ? 'daily-summaries-7d'
      : pathname.includes('/dailySleepSummariesByDate') ? 'sleep-7d'
      : pathname.includes('/hrv/daily/') ? 'hrv-7d'
      : undefined;
    if (!file) return new Response('not mocked', { status: 404 });
    return new Response(readFileSync(`${RAW}/${file}.json`), { headers: { 'Content-Type': 'application/json' } });
  },
});
const fixtureClient = Object.assign(baseClient, { memo: memoFor('test') });

describe.skipIf(!has)('mapeadores con datos reales', () => {
  it('mapea carreras con ritmo, FC y zonas coherentes', async () => {
    const runs = await getRuns(fixtureClient, '2000-01-01', '2100-01-01');
    expect(runs.length).toBe(raw('activities-running').length);
    for (const r of runs) {
      expect(r.id).toBeGreaterThan(0);
      expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.distanceKm).toBeGreaterThan(0);
      expect(r.paceSPerKm).toBeGreaterThan(150); // > 2:30 min/km
      expect(r.paceSPerKm).toBeLessThan(1200); // < 20 min/km
      expect(r.hrZonesS).toHaveLength(5);
      if (r.avgHr) expect(r.avgHr).toBeLessThanOrEqual(r.maxHr ?? Infinity);
    }
    // ordenadas de más reciente a más antigua
    expect(runs[0].startLocal >= runs.at(-1)!.startLocal).toBe(true);
  });

  it('ritmo = tiempo en movimiento / distancia', () => {
    const a = raw('activities-running')[0];
    const r = mapActivity(a);
    expect(r.paceSPerKm).toBeCloseTo(a.movingDuration / (a.distance / 1000), 3);
  });

  it('combina salud diaria por fecha', async () => {
    const dates = raw('daily-summaries-7d').data.map((d: { calendarDate: string }) => d.calendarDate).sort();
    const days = await getDailyHealth(fixtureClient, dates[0], dates.at(-1));
    expect(days).toHaveLength(dates.length);
    const withData = days.filter((d) => d.restingHr && d.steps !== undefined);
    expect(withData.length).toBeGreaterThan(0);
    expect(days.some((d) => d.sleepS && d.sleepScore)).toBe(true);
    expect(days.some((d) => d.hrvLastNight)).toBe(true);
    for (const d of days) if (d.bodyBatteryMax !== undefined) expect(d.bodyBatteryMax).toBeLessThanOrEqual(100);
  });

  it('zonas de FC y VO2max', async () => {
    const z = await getHrZones(fixtureClient);
    expect(z?.floors).toHaveLength(5);
    expect([...z!.floors].sort((a, b) => a - b)).toEqual(z!.floors);
    const vo2 = await getVo2Max(fixtureClient, '2000-01-01', '2100-01-01');
    expect(vo2.length).toBeGreaterThan(0);
    expect(vo2[0].value).toBeGreaterThan(20);
  });
});

describe.skipIf(!existsSync(`${RAW}/fitness-age.json`))('edad física con la respuesta real', () => {
  it('acepta el objeto suelto que devuelve la API (la spec dice lista)', async () => {
    const { pickFitnessAge } = await import('./fitness-age');
    const f = pickFitnessAge(raw('fitness-age'));
    expect(typeof f?.fitnessAge).toBe('number');
    expect(typeof f?.chronologicalAge).toBe('number');
    expect(pickFitnessAge([raw('fitness-age')])).toEqual(f);
  });
});
