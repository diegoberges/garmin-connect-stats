/**
 * Ajustes del usuario (API keys) guardados en una cookie httpOnly cifrada con AES-256-GCM.
 * El navegador nunca puede leer el contenido; solo el servidor con APP_SECRET.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { AstroCookies } from 'astro';

export interface UserSettings {
  garminApiKey?: string;
  /** Para comparar el VO2máx con tablas de referencia por sexo y edad. */
  sex?: 'male' | 'female';
}

export const SETTINGS_COOKIE = 'gcs_settings';
const ONE_YEAR = 60 * 60 * 24 * 365;

let cachedKey: Buffer | undefined;

/**
 * En producción (Vercel, sistema de ficheros efímero y varias instancias) APP_SECRET es obligatorio:
 * un secreto generado por instancia invalidaría las cookies. En local se genera y guarda en .data/.
 */
export function secretConfigured(): boolean {
  return Boolean(process.env.APP_SECRET) || import.meta.env.DEV;
}

function encryptionKey(): Buffer {
  if (cachedKey) return cachedKey;
  let secret = process.env.APP_SECRET;
  if (!secret && !import.meta.env.DEV) {
    throw new Error('Falta la variable de entorno APP_SECRET en el servidor.');
  }
  if (!secret) {
    const file = '.data/app-secret';
    if (existsSync(file)) {
      secret = readFileSync(file, 'utf8').trim();
    } else {
      mkdirSync('.data', { recursive: true });
      secret = randomBytes(32).toString('base64url');
      writeFileSync(file, secret, { mode: 0o600 });
    }
  }
  cachedKey = createHash('sha256').update(secret).digest();
  return cachedKey;
}

function encrypt(data: UserSettings): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
}

function decrypt(value: string): UserSettings | undefined {
  try {
    const raw = Buffer.from(value, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const json = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
    return JSON.parse(json) as UserSettings;
  } catch {
    return undefined; // cookie manipulada o secreto cambiado
  }
}

export function readSettings(cookies: AstroCookies): UserSettings {
  const value = cookies.get(SETTINGS_COOKIE)?.value;
  return (value && decrypt(value)) || {};
}

export function writeSettings(cookies: AstroCookies, settings: UserSettings, secure: boolean): void {
  cookies.set(SETTINGS_COOKIE, encrypt(settings), {
    httpOnly: true,
    sameSite: 'strict',
    secure,
    path: '/',
    maxAge: ONE_YEAR,
  });
}

export function clearSettings(cookies: AstroCookies): void {
  cookies.delete(SETTINGS_COOKIE, { path: '/' });
}

/** "••••••ab12" para mostrar en la UI sin exponer la key. */
export function maskKey(key: string): string {
  return key.length <= 4 ? '••••' : `••••••${key.slice(-4)}`;
}
