/**
 * SOLO DESARROLLO: mock local grabado con datos reales de Garmin.
 *
 * La primera vez en el día que la app pide una URL a Garmin, la respuesta se guarda en
 * `.data/mock/<hash de la key>/<día>/`; a partir de ahí, esa URL se sirve desde disco aunque se
 * refresque la página o se reinicie el servidor. Al día siguiente se vuelve a grabar (y se borra
 * lo del día anterior), así que en pruebas cada URL se pide como mucho una vez al día.
 *
 * - Solo en `astro dev` (`import.meta.env.DEV`); nunca en producción ni en los tests.
 * - Se desactiva con `GARMIN_MOCK=0`; `pnpm mock:reset` borra lo grabado para pedirlo de nuevo.
 * - Se guardan las respuestas (JSON y el ZIP del FIT), nunca la key ni el token.
 * - `.data/` está en `.gitignore`: estos datos personales no se suben.
 */
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { isoDate } from '../dates';

const ROOT = '.data/mock';

interface Recorded {
  url: string;
  savedAt: string;
  status: number;
  contentType: string;
  encoding: 'utf8' | 'base64';
  body: string;
}

export const diskMockEnabled = () => import.meta.env.DEV && process.env.GARMIN_MOCK !== '0' && !process.env.VITEST;

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

const toResponse = (r: Recorded) =>
  new Response(r.encoding === 'base64' ? Buffer.from(r.body, 'base64') : r.body, {
    status: r.status,
    headers: { 'Content-Type': r.contentType, 'X-Garmin-Mock': 'disk' },
  });

/** Días ya limpiados en este proceso (para no listar el directorio en cada petición). */
const cleaned = new Set<string>();

/** Borra lo grabado otros días para esta key: el mock se regenera cada día. */
async function cleanOldDays(userDir: string, day: string) {
  const id = `${resolve(userDir)} ${day}`;
  if (cleaned.has(id)) return;
  cleaned.add(id);
  const entries = await readdir(userDir).catch(() => [] as string[]);
  await Promise.all(
    entries.filter((d) => d !== day).map((d) => rm(`${userDir}/${d}`, { recursive: true, force: true })),
  );
}

/** Peticiones en curso por archivo: dos cargas simultáneas de la misma URL hacen una sola llamada. */
const pending = new Map<string, Promise<Recorded | Response>>();

async function record(file: string, url: string, res: Response): Promise<Recorded | Response> {
  // Solo se graba lo que ha ido bien; los errores (429, 5xx…) se devuelven tal cual y se reintentan
  if (!res.ok) return res;
  const contentType = res.headers.get('content-type') ?? 'application/octet-stream';
  const isText = /json|text/.test(contentType);
  const body = isText ? await res.text() : Buffer.from(await res.arrayBuffer()).toString('base64');
  const rec: Recorded = {
    url,
    savedAt: new Date().toISOString(),
    status: res.status,
    contentType,
    encoding: isText ? 'utf8' : 'base64',
    body,
  };
  await writeFile(file, JSON.stringify(rec));
  return rec;
}

/**
 * Envuelve la llamada real: sirve la URL desde disco si ya se grabó hoy y, si no, la pide y la graba.
 * `refresh` fuerza la llamada real (y regraba).
 */
export async function withDiskMock(
  keyHash: string,
  url: string,
  live: () => Promise<Response>,
  refresh = false,
): Promise<Response> {
  const day = isoDate();
  const userDir = `${ROOT}/${keyHash.slice(0, 16)}`;
  const dir = `${userDir}/${day}`;
  const file = `${dir}/${sha(url).slice(0, 32)}.json`;

  if (!refresh) {
    const saved = await readFile(file, 'utf8').catch(() => undefined);
    if (saved) return toResponse(JSON.parse(saved) as Recorded);
  }

  let job = pending.get(file);
  if (!job) {
    job = (async () => {
      await mkdir(dir, { recursive: true });
      await cleanOldDays(userDir, day);
      return record(file, url, await live());
    })();
    pending.set(file, job);
    job.finally(() => pending.delete(file)).catch(() => {});
  }
  const out = await job;
  // Una Response solo se puede leer una vez: si es un error compartido, cada llamada recibe un clon
  return out instanceof Response ? out.clone() : toResponse(out);
}
