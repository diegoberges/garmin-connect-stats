/** Utilidades de fecha en la zona horaria del usuario (por defecto Europe/Madrid). */
export const DEFAULT_TZ = 'Europe/Madrid';
const DAY = 86_400_000;

export function isoDate(date = new Date(), timeZone = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

/** Suma días a una fecha YYYY-MM-DD (aritmética en UTC, sin problemas de DST). */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
}

export function daysAgo(days: number, timeZone = DEFAULT_TZ): string {
  return addDays(isoDate(new Date(), timeZone), -days);
}

/** Lunes de la semana ISO de una fecha YYYY-MM-DD. */
export function weekStart(date: string): string {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = domingo
  return addDays(date, -((dow + 6) % 7));
}

/** Lista de días [from..to] inclusive. */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Trocea [from..to] en ventanas de `size` días (para endpoints con rango limitado). */
export function chunkRange(from: string, to: string, size: number): [string, string][] {
  const out: [string, string][] = [];
  for (let s = from; s <= to; s = addDays(s, size)) {
    const e = addDays(s, size - 1);
    out.push([s, e < to ? e : to]);
  }
  return out;
}
