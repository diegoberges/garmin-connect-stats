import type { AstroCookies } from 'astro';

/** Mensaje de un solo uso tras un POST con redirección (patrón PRG). No contiene datos sensibles. */
export interface Flash {
  type: 'success' | 'error';
  text: string;
}

const COOKIE = 'gcs_flash';

export function setFlash(cookies: AstroCookies, flash: Flash, secure: boolean) {
  cookies.set(COOKIE, JSON.stringify(flash), { path: '/', httpOnly: true, sameSite: 'lax', secure, maxAge: 60 });
}

export function takeFlash(cookies: AstroCookies): Flash | undefined {
  const raw = cookies.get(COOKIE)?.value;
  if (!raw) return undefined;
  cookies.delete(COOKIE, { path: '/' });
  try {
    const f = JSON.parse(raw) as Flash;
    return (f.type === 'success' || f.type === 'error') && typeof f.text === 'string' ? f : undefined;
  } catch {
    return undefined;
  }
}
