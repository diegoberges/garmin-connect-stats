import type { APIRoute } from 'astro';

/** La portada es la sección de Salud. */
export const GET: APIRoute = ({ redirect }) => redirect('/salud', 302);
