/**
 * Cabeceras de seguridad para todas las respuestas del servidor (las aplica `middleware.ts`).
 * HSTS ya lo pone Vercel. No hay CSP de scripts todavía: hay scripts en línea (tema) y la analítica
 * de Vercel, y eso requiere nonces; aquí van solo las directivas que no pueden romper nada.
 */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  // Nadie puede meter la app en un iframe (protege el formulario de la API key de clickjacking)
  'Content-Security-Policy': "frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'",
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  // Las teselas de OpenStreetMap piden un Referer válido: con esto solo ven el origen, no la ruta
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  // El único enlace a otra web (Garmin) ya va con rel="noopener"
  'Cross-Origin-Opener-Policy': 'same-origin',
};

/**
 * Devuelve la respuesta con las cabeceras de seguridad. Si sus cabeceras son inmutables
 * (p. ej. `Response.redirect`), la copia antes de modificarlas.
 */
export function withSecurityHeaders(response: Response): Response {
  try {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) response.headers.set(name, value);
    return response;
  } catch {
    const copy = new Response(response.body, response);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) copy.headers.set(name, value);
    return copy;
  }
}
