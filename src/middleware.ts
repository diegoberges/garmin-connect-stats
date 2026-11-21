import { defineMiddleware } from 'astro:middleware';
import { readSettings } from './lib/settings';

export const onRequest = defineMiddleware((context, next) => {
  context.locals.settings = readSettings(context.cookies);
  return next();
});
