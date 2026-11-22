/**
 * Tema claro/oscuro. Sin valor guardado se sigue al sistema; el botón alterna lo que se ve y, si el
 * resultado coincide con el sistema, borra la preferencia en vez de guardarla (así se vuelve a seguir
 * al sistema y no queda fijado sin que el usuario lo sepa).
 */
export type Scheme = 'light' | 'dark';

/** Clave de `localStorage` (la misma que antes, para respetar lo ya guardado). */
export const THEME_KEY = 'theme';

/** Valor guardado válido o `null` si no hay (o no es reconocible). */
export function parseStored(value: string | null): Scheme | null {
  return value === 'light' || value === 'dark' ? value : null;
}

/** Contenido de `<meta name="color-scheme">` para un valor guardado. */
export function metaContent(stored: Scheme | null): string {
  return stored ?? 'light dark';
}

/** Tema que se ve: el guardado o, si no hay, el del sistema. */
export function resolvedScheme(stored: Scheme | null, systemDark: boolean): Scheme {
  if (stored) return stored;
  return systemDark ? 'dark' : 'light';
}

/**
 * Qué guardar al pulsar el botón: el contrario de lo que se ve, salvo que coincida con el sistema
 * (entonces `null`: se borra y se sigue al sistema). Solo se compara al guardar, nunca después.
 */
export function nextStored(rendered: Scheme, systemDark: boolean): Scheme | null {
  const target: Scheme = rendered === 'dark' ? 'light' : 'dark';
  const system: Scheme = systemDark ? 'dark' : 'light';
  return target === system ? null : target;
}
