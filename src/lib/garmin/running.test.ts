import { describe, expect, it } from 'vitest';
import { isRace, mapActivity } from './running';
import type { ApiActivity } from './types';

const api = (eventType: unknown) =>
  ({ activityId: 1, startTimeLocal: '2026-11-08 09:00:00', distance: 10000, eventType }) as unknown as ApiActivity;

describe('competiciones', () => {
  it('lee el tipo de evento de la búsqueda', () => {
    expect(mapActivity(api({ typeId: 1, typeKey: 'race' })).eventTypeKey).toBe('race');
    expect(mapActivity(api(null)).eventTypeKey).toBeUndefined();
  });

  it('solo cuenta como competición lo marcado como race (la API puede ignorar el filtro)', () => {
    expect(isRace(mapActivity(api({ typeKey: 'race' })))).toBe(true);
    expect(isRace(mapActivity(api({ typeKey: 'uncategorized' })))).toBe(false);
    expect(isRace(mapActivity(api(undefined)))).toBe(false);
  });
});
