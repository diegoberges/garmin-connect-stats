import { unwrap, type GarminClient } from './client';
import type { ApiActivity, UserProfile } from './types';

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

/**
 * Datos del menú de perfil. Cada fuente es opcional: si una falla, el resto se muestra igual.
 * Las respuestas pasan por la caché del cliente, así que pintar el menú en cada página no repite llamadas.
 */
export async function getProfile(client: GarminClient): Promise<UserProfile> {
  let connectionError: string | undefined;
  const [settings, last] = await Promise.all([
    unwrap(client.GET('/userprofile-service/userprofile/settings', {})).catch((err: unknown) => {
      connectionError = err instanceof Error ? err.message : 'No se pudo conectar con Garmin.';
      return undefined;
    }),
    unwrap(
      client.GET('/activitylist-service/activities/search/activities', { params: { query: { start: 0, limit: 1 } } }),
    )
      .then((list) => (Array.isArray(list) ? (list[0] as ApiActivity | undefined) : undefined))
      .catch(() => undefined),
  ]);

  return {
    displayName: str(settings?.displayName) ?? str(last?.ownerDisplayName),
    fullName: str(last?.ownerFullName),
    imageUrl: str(last?.ownerProfileImageUrlMedium) ?? str(last?.ownerProfileImageUrlSmall),
    timeZone: str(settings?.timeZone),
    connectionError,
  };
}
