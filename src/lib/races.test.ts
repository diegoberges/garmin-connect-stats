import { describe, expect, it } from 'vitest';
import { bestRaceIds, raceCategory } from './races';
import type { Activity } from './garmin/types';

const race = (id: number, distanceKm: number, durationS: number, typeKey = 'running') =>
  ({ id, distanceKm, durationS, typeKey }) as Activity;

describe('competiciones', () => {
  it('clasifica por distancia con margen de GPS y deja el trail aparte', () => {
    expect(raceCategory(race(1, 5.08, 0))).toBe('5K');
    expect(raceCategory(race(1, 10.21, 0))).toBe('10K');
    expect(raceCategory(race(1, 21.3, 0))).toBe('Media');
    expect(raceCategory(race(1, 42.6, 0))).toBe('Maratón');
    expect(raceCategory(race(1, 15, 0))).toBe('Otra');
    expect(raceCategory(race(1, 21.1, 0, 'trail_running'))).toBe('Otra');
  });
  it('marca la mejor de cada categoría', () => {
    const ids = bestRaceIds([race(1, 10.1, 2700), race(2, 10.0, 2600), race(3, 5.0, 1300), race(4, 15, 100)]);
    expect([...ids].sort()).toEqual([2, 3]);
  });
});
