/**
 * Cliente tipado de la Garmin Connect Personal API.
 * Rutas, parámetros y respuestas salen de la spec OpenAPI (docs/garmin-personal-api.json →
 * schema.d.ts, regenerar con `npm run gen:api`). Aquí solo se añade: auth, caché TTL y errores.
 */
import createClient from 'openapi-fetch';
import { createHash } from 'node:crypto';
import { getAccessToken, forgetToken } from './auth';
import type { paths } from './schema';

export const GARMIN_API_BASE = process.env.GARMIN_API_BASE ?? 'https://personal.connectapi.garmin.com';

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { expiresAt: number; body: string }>();

export class GarminApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'GarminApiError';
  }
}

export { GarminAuthError } from './auth';

export interface ClientOptions {
  /** Ignora la caché y fuerza un token nuevo. */
  fresh?: boolean;
  ttlMs?: number;
}

const jsonResponse = (body: string) =>
  new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } });

export function createGarminClient(apiKey: string, { fresh = false, ttlMs = DEFAULT_TTL_MS }: ClientOptions = {}) {
  const keyHash = createHash('sha256').update(apiKey).digest('hex');

  const garminFetch = async (request: Request): Promise<Response> => {
    const cacheKey = `${keyHash} ${request.url}`;
    const hit = cache.get(cacheKey);
    if (!fresh && hit && hit.expiresAt > Date.now()) return jsonResponse(hit.body);

    const send = async (force: boolean) => {
      const req = request.clone();
      req.headers.set('Authorization', `Bearer ${await getAccessToken(apiKey, { force })}`);
      return fetch(req);
    };

    let res = await send(fresh);
    if (res.status === 401) {
      forgetToken(apiKey); // token caducado antes de tiempo: un reintento con token nuevo
      res = await send(true);
    }
    const isJson = res.headers.get('content-type')?.includes('json');
    if (res.ok && isJson) {
      const body = await res.text();
      cache.set(cacheKey, { expiresAt: Date.now() + ttlMs, body });
      return jsonResponse(body);
    }
    return res;
  };

  const client = createClient<paths>({ baseUrl: GARMIN_API_BASE, fetch: garminFetch });
  return Object.assign(client, { memo: memoFor(keyHash, fresh) });
}

/**
 * Caché en memoria de resultados ya procesados (p. ej. un recorrido decodificado del FIT),
 * separada por usuario (hash de la key). Pocas entradas: son objetos grandes.
 */
const memoStore = new Map<string, { expiresAt: number; value: Promise<unknown> }>();
const MEMO_MAX = 30;
export type Memo = <T>(key: string, ttlMs: number, compute: () => Promise<T>) => Promise<T>;

export function memoFor(scope: string, fresh = false): Memo {
  return <T>(key: string, ttlMs: number, compute: () => Promise<T>) => {
    const k = `${scope} ${key}`;
    const hit = memoStore.get(k);
    if (!fresh && hit && hit.expiresAt > Date.now()) return hit.value as Promise<T>;
    const value = compute();
    value.catch(() => memoStore.delete(k)); // no cachear fallos
    memoStore.delete(k);
    memoStore.set(k, { expiresAt: Date.now() + ttlMs, value });
    while (memoStore.size > MEMO_MAX) memoStore.delete(memoStore.keys().next().value!);
    return value;
  };
}

export type GarminClient = ReturnType<typeof createGarminClient>;

/** Convierte el resultado {data, error, response} de openapi-fetch en datos o excepción. */
export async function unwrap<T>(call: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  const { data, error, response } = await call;
  if (response.ok && data !== undefined) return data;
  if (response.status === 429) {
    throw new GarminApiError('Garmin ha limitado las peticiones; prueba en unos minutos', 429);
  }
  const detail = (typeof error === 'string' ? error : JSON.stringify(error ?? '')).slice(0, 200);
  const path = new URL(response.url || 'https://x').pathname;
  const suffix = detail ? `: ${detail}` : '';
  throw new GarminApiError(`Garmin respondió ${response.status} en ${path}${suffix}`, response.status);
}
