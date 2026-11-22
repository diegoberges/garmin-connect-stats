/**
 * Intercambio Personal API Key -> access token (OAuth2, ~24 h, sin refresh token).
 * Doc: https://developer.garmin.com/gc-developer-program/personal/personal-api/
 * Los tokens se cachean en memoria por hash de la key (nunca la key en claro como clave).
 */
import { createHash } from 'node:crypto';

const TOKEN_URL = 'https://personal.connectapi.garmin.com/personalapitoken-service/personal-api/personal-api-key/token';

/** Margen para renovar antes de que caduque. */
const SAFETY_MS = 5 * 60 * 1000;
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

const tokens = new Map<string, CachedToken>();

export class GarminAuthError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'GarminAuthError';
  }
}

const keyId = (apiKey: string) => createHash('sha256').update(apiKey).digest('hex');

/** Extrae token y caducidad tolerando distintas formas de respuesta (por confirmar con el Swagger). */
function parseTokenResponse(body: unknown): CachedToken {
  const b = (body ?? {}) as Record<string, unknown>;
  const accessToken = (b.access_token ?? b.accessToken ?? b.token) as string | undefined;
  if (!accessToken || typeof accessToken !== 'string') {
    throw new GarminAuthError('Respuesta de token inesperada de Garmin');
  }
  const expiresIn = Number(b.expires_in ?? b.expiresIn);
  const ttl = Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn * 1000 : DEFAULT_TTL_MS;
  return { accessToken, expiresAt: Date.now() + ttl };
}

async function requestToken(apiKey: string): Promise<CachedToken> {
  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { Authorization: `ApiKey ${apiKey}` },
    });
  } catch (err) {
    throw new GarminAuthError(`No se pudo contactar con Garmin: ${(err as Error).message}`);
  }
  if (res.status === 401 || res.status === 403) {
    throw new GarminAuthError('La API key no es válida o ha caducado', res.status);
  }
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    console.error(`[garmin] token ${res.status} ${res.headers.get('content-type') ?? ''}: ${detail}`);
    throw new GarminAuthError(`Error al obtener el token (${res.status})${detail ? `: ${detail}` : ''}`, res.status);
  }
  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = { access_token: text.trim() }; // por si devuelve el token en texto plano
  }
  return parseTokenResponse(body);
}

export async function getAccessToken(apiKey: string, { force = false } = {}): Promise<string> {
  const id = keyId(apiKey);
  const cached = tokens.get(id);
  if (!force && cached && cached.expiresAt - SAFETY_MS > Date.now()) return cached.accessToken;
  const fresh = await requestToken(apiKey);
  tokens.set(id, fresh);
  return fresh.accessToken;
}

export function forgetToken(apiKey: string): void {
  tokens.delete(keyId(apiKey));
}
