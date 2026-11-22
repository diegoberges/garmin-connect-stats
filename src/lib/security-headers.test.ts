import { describe, expect, it } from 'vitest';
import { SECURITY_HEADERS, withSecurityHeaders } from './security-headers';

const expectAll = (res: Response) => {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) expect(res.headers.get(name)).toBe(value);
};

describe('cabeceras de seguridad', () => {
  it('se añaden a una respuesta normal sin tocar el resto', async () => {
    const res = withSecurityHeaders(new Response('hola', { status: 200, headers: { 'Content-Type': 'text/html' } }));
    expectAll(res);
    expect(res.headers.get('Content-Type')).toBe('text/html');
    expect(await res.text()).toBe('hola');
  });

  it('funcionan con redirecciones de cabeceras inmutables', () => {
    const res = withSecurityHeaders(Response.redirect('https://example.com/salud', 303));
    expectAll(res);
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('https://example.com/salud');
  });

  it('impiden meter la app en un iframe', () => {
    expect(SECURITY_HEADERS['X-Frame-Options']).toBe('DENY');
    expect(SECURITY_HEADERS['Content-Security-Policy']).toContain("frame-ancestors 'none'");
  });
});
