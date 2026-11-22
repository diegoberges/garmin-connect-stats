import { createGarminClient, type GarminClient } from './client';
import { createFixtureClient, fixturesEnabled } from './fixtures';

/** Cliente para la key del usuario actual (undefined si no ha configurado ninguna). */
export function clientFor(locals: App.Locals): GarminClient | undefined {
  if (fixturesEnabled()) return createFixtureClient();
  const key = locals.settings.garminApiKey;
  return key ? createGarminClient(key) : undefined;
}

export * from './running';
export * from './wellness';
export * from './profile';
export type * from './types';
