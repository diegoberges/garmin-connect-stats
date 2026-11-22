/**
 * Recorrido y series de una actividad a partir de su archivo original.
 * La API JSON no trae GPS ni datos por segundo: solo están en el .FIT, que Garmin entrega
 * dentro de un ZIP en /download-service/files/activity/{id}. Se decodifica con el SDK oficial.
 */
import { Decoder, Stream, type EventMesg, type RecordMesg } from '@garmin/fitsdk';
import { unzipSync } from 'fflate';
import type { GarminClient } from './client';
import { GarminApiError } from './client';
import { gradeFactor } from '../efficiency';

/** Punto ya agregado para gráficas (x = distancia en km, o minutos si no hay distancia). */
export interface SeriesPoint {
  x: number;
  hr?: number;
  /** velocidad media del tramo, m/s */
  speed?: number;
  /** velocidad ajustada por pendiente (Minetti), m/s */
  gapSpeed?: number;
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
  /** distancia "en llano equivalente" (m) y tiempo activo (s), para el ritmo ajustado por pendiente */
  gapDistanceM?: number;
  activeS?: number;
  /** Desacoplamiento FC/ritmo ajustado entre 1.ª y 2.ª mitad (%), sin los 10 primeros minutos */
  decoupling?: { pct: number; durationS: number };
}

interface Sample {
  /** segundos de tiempo activo (sin pausas) */
  t: number;
  /** distancia acumulada ajustada por pendiente (m) */
  gd?: number;
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
    if (!response.ok || !data)
      throw new GarminApiError(`Garmin respondió ${response.status} al descargar la actividad`, response.status);
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
  addGradeAdjusted(samples);
  const last = samples.at(-1)!;
  return {
    route: simplifyRoute(samples),
    ...buildSeries(samples),
    ...buildSplits(samples),
    gapDistanceM: last.gd,
    activeS: last.t,
    decoupling: decoupling(samples),
  };
}

const isZip = (b: Uint8Array) => b[0] === 0x50 && b[1] === 0x4b;

/** Intervalos en pausa: entre un 'stop' del temporizador y el siguiente 'start'. */
function timerPauses(events: EventMesg[]): [number, number][] {
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
  return pauses;
}

/** Milisegundos en pausa antes del instante `ts`. */
function pausedBefore(pauses: [number, number][], ts: number): number {
  let total = 0;
  for (const [from, to] of pauses) {
    if (ts >= to) total += to - from;
    else if (ts > from) total += ts - from;
  }
  return total;
}

/** Un registro del FIT como muestra, con `t` ya calculado. */
function recordToSample(r: RecordMesg, t: number): Sample {
  const lat = n(r.positionLat);
  const lon = n(r.positionLong);
  const hasPosition = lat !== undefined && lon !== undefined;
  const cadence = n(r.cadence);
  return {
    t,
    d: n(r.distance),
    lat: hasPosition ? lat * SEMI_TO_DEG : undefined,
    lon: hasPosition ? lon * SEMI_TO_DEG : undefined,
    hr: n(r.heartRate),
    alt: n(r.enhancedAltitude) ?? n(r.altitude),
    cadence: cadence === undefined ? undefined : cadence + (n(r.fractionalCadence) ?? 0),
  };
}

/** Registros del FIT → muestras con tiempo activo (descontando pausas del cronómetro). */
function toSamples(records: RecordMesg[], events: EventMesg[]): Sample[] {
  const pauses = timerPauses(events);
  const out: Sample[] = [];
  let t0: number | undefined;
  for (const r of records) {
    if (!(r.timestamp instanceof Date)) continue;
    const ts = r.timestamp.getTime();
    t0 ??= ts;
    out.push(recordToSample(r, (ts - t0 - pausedBefore(pauses, ts)) / 1000));
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
    const dgd = (end.gd ?? 0) - (first.gd ?? 0);
    series.push({
      x: Math.round((i + 0.5) * width * 100) / 100,
      hr: round(avg(g.map((s) => s.hr))),
      speed: byDistance && dt > 0 && dd >= 0 ? dd / dt : undefined,
      gapSpeed: byDistance && dt > 0 && dgd >= 0 && end.gd !== undefined ? dgd / dt : undefined,
      alt: round(avg(g.map((s) => s.alt)), 1),
      cadence: round(avg(g.map((s) => s.cadence))),
    });
    prev = end;
  }
  return { series, xUnit: byDistance ? 'km' : 'min' };
}

const round = (v: number | undefined, digits = 0) =>
  v === undefined ? undefined : Math.round(v * 10 ** digits) / 10 ** digits;

/** Tramo de km en curso: lo que se acumula hasta cerrar el parcial. */
interface OpenSplit {
  startT: number;
  startD: number;
  hrs: number[];
  gain: number;
  loss: number;
}

const closeSplit = (seg: OpenSplit, index: number, distanceM: number, timeS: number): KmSplit => ({
  index,
  distanceM,
  timeS,
  avgHr: round(avg(seg.hrs)),
  elevGainM: Math.round(seg.gain),
  elevLossM: Math.round(seg.loss),
});

/** Instante (s) en que se alcanza la distancia `mark` entre dos muestras, por interpolación lineal. */
function timeAt(a: Sample, b: Sample, mark: number): number {
  const da = a.d!;
  const db = b.d!;
  const f = db === da ? 1 : (mark - da) / (db - da);
  return a.t + f * (b.t - a.t);
}

/** Parciales por kilómetro (interpolando el instante exacto de cada km) y el más rápido. */
function buildSplits(samples: Sample[]): Pick<ActivityTrack, 'splits' | 'fastestSplitS'> {
  const withD = samples.filter((s) => s.d !== undefined);
  const total = withD.at(-1)?.d ?? 0;
  if (total < 500) return { splits: [] };

  const splits: KmSplit[] = [];
  // La actividad empieza en el km 0 aunque el primer registro marque unos metros
  let seg: OpenSplit = { startT: withD[0].t, startD: 0, hrs: [], gain: 0, loss: 0 };
  let prevAlt: number | undefined;
  let mark = 1000;

  for (let i = 1; i < withD.length; i++) {
    const b = withD[i];
    if (b.hr !== undefined) seg.hrs.push(b.hr);
    if (b.alt !== undefined) {
      const diff = prevAlt === undefined ? 0 : b.alt - prevAlt;
      if (diff > 0) seg.gain += diff;
      else seg.loss -= diff;
      prevAlt = b.alt;
    }
    while (b.d! >= mark) {
      const tAt = timeAt(withD[i - 1], b, mark);
      splits.push(closeSplit(seg, splits.length + 1, mark - seg.startD, tAt - seg.startT));
      seg = { startT: tAt, startD: mark, hrs: [], gain: 0, loss: 0 };
      mark += 1000;
    }
  }
  const rest = total - seg.startD;
  if (rest >= 50) splits.push(closeSplit(seg, splits.length + 1, rest, withD.at(-1)!.t - seg.startT));
  const full = splits.filter((s) => s.distanceM >= 999 && s.timeS > 0);
  return { splits, fastestSplitS: full.length ? Math.min(...full.map((s) => s.timeS)) : undefined };
}

/**
 * Distancia acumulada "en llano equivalente": cada tramo se multiplica por el factor de coste de Minetti
 * según la pendiente, medida sobre ≥ 20 m de recorrido con la altitud suavizada (el barómetro tiene ruido).
 */
function addGradeAdjusted(samples: Sample[]) {
  const alt = samples.map((_, i) => avg(samples.slice(Math.max(0, i - 5), i + 6).map((s) => s.alt)));
  let gd = 0;
  let j = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    if (s.d === undefined) continue;
    const prev = samples[i - 1];
    const dd = prev?.d !== undefined ? Math.max(0, s.d - prev.d) : 0;
    while (j < i && samples[j].d !== undefined && s.d - samples[j].d! > 20) j++;
    const k = Math.max(0, j - 1);
    const run = samples[k].d !== undefined ? s.d - samples[k].d! : 0;
    const grade = run >= 20 && alt[i] !== undefined && alt[k] !== undefined ? (alt[i]! - alt[k]!) / run : 0;
    gd += dd * gradeFactor(grade);
    s.gd = gd;
  }
}

/** EF (velocidad ajustada ÷ FC) en la 1.ª frente a la 2.ª mitad del tiempo activo, sin calentamiento. */
function decoupling(samples: Sample[]): ActivityTrack['decoupling'] {
  const last = samples.at(-1)!;
  const warmup = last.t > 40 * 60 ? 10 * 60 : 0;
  const body = samples.filter((s) => s.t >= warmup && s.gd !== undefined);
  if (body.length < 10 || last.t - warmup < 20 * 60) return undefined;
  const mid = (body[0].t + body.at(-1)!.t) / 2;
  const half = (part: Sample[]) => {
    const hr = avg(part.map((s) => s.hr));
    const dt = part.at(-1)!.t - part[0].t;
    const dgd = part.at(-1)!.gd! - part[0].gd!;
    return hr && dt > 0 ? dgd / dt / hr : undefined;
  };
  const ef1 = half(body.filter((s) => s.t <= mid));
  const ef2 = half(body.filter((s) => s.t >= mid));
  if (!ef1 || !ef2) return undefined;
  return { pct: ((ef1 - ef2) / ef1) * 100, durationS: body.at(-1)!.t - body[0].t };
}
