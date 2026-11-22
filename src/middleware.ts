import { defineMiddleware } from 'astro:middleware';
import { readSettings } from './lib/settings';
import { takeFlash } from './lib/flash';
import { withSecurityHeaders } from './lib/security-headers';

export const onRequest = defineMiddleware(async (context, next) => {
  context.locals.settings = readSettings(context.cookies);
  context.locals.flash = takeFlash(context.cookies);
  return withSecurityHeaders(await next());
});
