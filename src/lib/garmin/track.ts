/**
 * Recorrido y series de una actividad a partir de su archivo original.
 * La API JSON no trae GPS ni datos por segundo: solo están en el .FIT, que Garmin entrega
 * dentro de un ZIP en /download-service/files/activity/{id}. Se decodifica con el SDK oficial.
 */
import { Decoder, Stream, type EventMesg, type RecordMesg } from '@garmin/fitsdk';
import { unzipSync } from 'fflate';
import type { GarminClient } from './client';
import { GarminApiError } from './client';

/** Punto ya agregado para gráficas (x = distancia en km, o minutos si no hay distancia). */
export interface SeriesPoint {
  x: number;
  hr?: number;
  /** velocidad media del tramo, m/s */
  speed?: number;
  alt?: number;
  cadence?: number;
}

export interface KmSplit {
  /** número de km (el último puede ser parcial) */
  index: number;
  distanceM: number;
  timeS: number;
  avgHr?: number;
  elevGainM: number;
  elevLossM: number;
}

export interface ActivityTrack {
  /** [lat, lon] simplificado para el mapa */
  route: [number, number][];
  series: SeriesPoint[];
  /** eje x de las series */
  xUnit: 'km' | 'min';
  splits: KmSplit[];
  /** mejor km completo (s) */
  fastestSplitS?: number;
}

interface Sample {
  /** segundos de tiempo activo (sin pausas) */
  t: number;
  d?: number;
  lat?: number;
  lon?: number;
  hr?: number;
  alt?: number;
  cadence?: number;
}

const SEMI_TO_DEG = 180 / 2 ** 31;
const ROUTE_POINTS = 800;
const SERIES_POINTS = 200;
const TTL_MS = 60 * 60 * 1000; // una actividad terminada no cambia

const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** Recorrido de la actividad, o undefined si el archivo no tiene datos utilizables. */
export function getActivityTrack(client: GarminClient, id: number): Promise<ActivityTrack | undefined> {
  return client.memo(`track:${id}`, TTL_MS, async () => {
    const { data, response } = await client.GET('/download-service/files/activity/{activityId}', {
      params: { path: { activityId: id } },
      parseAs: 'arrayBuffer',
    });
    if (!response.ok || !data) throw new GarminApiError(`Garmin respondió ${response.status} al descargar la actividad`, response.status);
    return parseActivityFile(new Uint8Array(data as ArrayBuffer));
  });
}

/** ZIP (o FIT suelto) → recorrido. Exportado para tests. */
export function parseActivityFile(bytes: Uint8Array): ActivityTrack | undefined {
  const fit = isZip(bytes) ? Object.entries(unzipSync(bytes)).find(([name]) => /\.fit$/i.test(name))?.[1] : bytes;
  if (!fit) return undefined;
  const { messages } = new Decoder(Stream.fromByteArray(fit)).read();
  const samples = toSamples(messages.recordMesgs ?? [], messages.eventMesgs ?? []);
  if (samples.length < 2) return undefined;
  return {
    route: simplifyRoute(samples),
    ...buildSeries(samples),
    ...buildSplits(samples),
  };
}

const isZip = (b: Uint8Array) => b[0] === 0x50 && b[1] === 0x4b;

/** Registros del FIT → muestras con tiempo activo (descontando pausas del cronómetro). */
function toSamples(records: RecordMesg[], events: EventMesg[]): Sample[] {
  // Intervalos en pausa: entre un 'stop' del temporizador y el siguiente 'start'
  const pauses: [number, number][] = [];
  let stoppedAt: number | undefined;
  for (const e of events) {
    if (e.event !== 'timer' || !(e.timestamp instanceof Date)) continue;
    const ts = e.timestamp.getTime();
    if (String(e.eventType).startsWith('stop')) stoppedAt ??= ts;
    else if (e.eventType === 'start' && stoppedAt !== undefined) {
      pauses.push([stoppedAt, ts]);
      stoppedAt = undefined;
    }
  }
  const pausedBefore = (ts: number) =>
    pauses.reduce((acc, [a, b]) => acc + (ts >= b ? b - a : ts > a ? ts - a : 0), 0);

  const out: Sample[] = [];
  let t0: number | undefined;
  for (const r of records) {
    if (!(r.timestamp instanceof Date)) continue;
    const ts = r.timestamp.getTime();
    t0 ??= ts;
    const lat = n(r.positionLat);
    const lon = n(r.positionLong);
    out.push({
      t: (ts - t0 - pausedBefore(ts)) / 1000,
      d: n(r.distance),
      lat: lat !== undefined && lon !== undefined ? lat * SEMI_TO_DEG : undefined,
      lon: lat !== undefined && lon !== undefined ? lon * SEMI_TO_DEG : undefined,
      hr: n(r.heartRate),
      alt: n(r.enhancedAltitude) ?? n(r.altitude),
      cadence: n(r.cadence) !== undefined ? (n(r.cadence)! + (n(r.fractionalCadence) ?? 0)) : undefined,
    });
  }
  return out;
}

/** Submuestreo uniforme del recorrido (suficiente para dibujarlo; conserva inicio y fin). */
function simplifyRoute(samples: Sample[]): [number, number][] {
  const gps = samples.filter((s) => s.lat !== undefined && s.lon !== undefined && (s.lat !== 0 || s.lon !== 0));
  if (gps.length < 2) return [];
  const step = Math.max(1, Math.ceil(gps.length / ROUTE_POINTS));
  const pts = gps.filter((_, i) => i % step === 0 || i === gps.length - 1);
  return pts.map((s) => [Math.round(s.lat! * 1e6) / 1e6, Math.round(s.lon! * 1e6) / 1e6]);
}

const avg = (xs: (number | undefined)[]) => {
  const v = xs.filter((x): x is number => x !== undefined);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined;
};

/** Agrupa en ~200 tramos iguales del eje x y promedia; la velocidad sale de Δdistancia/Δtiempo del tramo. */
function buildSeries(samples: Sample[]): Pick<ActivityTrack, 'series' | 'xUnit'> {
  const last = samples.at(-1)!;
  const byDistance = (last.d ?? 0) > 200;
  const xOf = (s: Sample) => (byDistance ? (s.d ?? 0) / 1000 : s.t / 60);
  const xMax = xOf(last);
  if (xMax <= 0) return { series: [], xUnit: byDistance ? 'km' : 'min' };
  const bins = Math.min(SERIES_POINTS, samples.length);
  const width = xMax / bins;
  const groups: Sample[][] = Array.from({ length: bins }, () => []);
  for (const s of samples) groups[Math.min(bins - 1, Math.floor(xOf(s) / width))].push(s);

  const series: SeriesPoint[] = [];
  let prev: Sample | undefined;
  for (const [i, g] of groups.entries()) {
    if (!g.length) continue;
    const first = prev ?? g[0];
    const end = g.at(-1)!;
    const dt = end.t - first.t;
    const dd = (end.d ?? 0) - (first.d ?? 0);
    series.push({
      x: Math.round((i + 0.5) * width * 100) / 100,
      hr: round(avg(g.map((s) => s.hr))),
      speed: byDistance && dt > 0 && dd >= 0 ? dd / dt : undefined,
      alt: round(avg(g.map((s) => s.alt)), 1),
      cadence: round(avg(g.map((s) => s.cadence))),
    });
    prev = end;
  }
  return { series, xUnit: byDistance ? 'km' : 'min' };
}

const round = (v: number | undefined, digits = 0) =>
  v === undefined ? undefined : Math.round(v * 10 ** digits) / 10 ** digits;

/** Parciales por kilómetro (interpolando el instante exacto de cada km) y el más rápido. */
function buildSplits(samples: Sample[]): Pick<ActivityTrack, 'splits' | 'fastestSplitS'> {
  const withD = samples.filter((s) => s.d !== undefined);
  const total = withD.at(-1)?.d ?? 0;
  if (total < 500) return { splits: [] };

  const splits: KmSplit[] = [];
  let startT = withD[0].t;
  let startD = 0; // la actividad empieza en el km 0 aunque el primer registro marque unos metros
  let hrs: number[] = [];
  let gain = 0;
  let loss = 0;
  let prevAlt: number | undefined;
  let mark = 1000;

  for (let i = 1; i < withD.length; i++) {
    const a = withD[i - 1];
    const b = withD[i];
    if (b.hr !== undefined) hrs.push(b.hr);
    if (b.alt !== undefined) {
      if (prevAlt !== undefined) {
        const diff = b.alt - prevAlt;
        if (diff > 0) gain += diff;
        else loss -= diff;
      }
      prevAlt = b.alt;
    }
    while (b.d! >= mark) {
      const f = b.d! === a.d! ? 1 : (mark - a.d!) / (b.d! - a.d!);
      const tAt = a.t + f * (b.t - a.t);
      splits.push({ index: splits.length + 1, distanceM: mark - startD, timeS: tAt - startT, avgHr: round(avg(hrs)), elevGainM: Math.round(gain), elevLossM: Math.round(loss) });
      startT = tAt;
      startD = mark;
      hrs = [];
      gain = 0;
      loss = 0;
      mark += 1000;
    }
  }
  const rest = total - startD;
  if (rest >= 50) {
    splits.push({ index: splits.length + 1, distanceM: rest, timeS: withD.at(-1)!.t - startT, avgHr: round(avg(hrs)), elevGainM: Math.round(gain), elevLossM: Math.round(loss) });
  }
  const full = splits.filter((s) => s.distanceM >= 999 && s.timeS > 0);
  return { splits, fastestSplitS: full.length ? Math.min(...full.map((s) => s.timeS)) : undefined };
}
