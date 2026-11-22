import { defineMiddleware } from 'astro:middleware';
import { readSettings } from './lib/settings';
import { takeFlash } from './lib/flash';

export const onRequest = defineMiddleware((context, next) => {
  context.locals.settings = readSettings(context.cookies);
  context.locals.flash = takeFlash(context.cookies);
  return next();
});
