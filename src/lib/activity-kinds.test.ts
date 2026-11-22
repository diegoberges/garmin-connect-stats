import { describe, expect, it } from 'vitest';
import { kindOf, speedValue } from './activity-kinds';
import { activityLabel } from './format';

describe('kindOf', () => {
  it('clasifica los tipos de Garmin por familia', () => {
    expect(kindOf('trail_running')).toBe('foot');
    expect(kindOf('walking')).toBe('foot');
    expect(kindOf('hiking')).toBe('foot');
    expect(kindOf('road_biking')).toBe('cycling');
    expect(kindOf('virtual_ride')).toBe('cycling');
    expect(kindOf('lap_swimming')).toBe('swim');
    expect(kindOf('strength_training')).toBe('other');
    expect(kindOf('indoor_rowing')).toBe('other');
  });
});

describe('speedValue', () => {
  it('ritmo s/km a pie, km/h en bici, s/100 m nadando', () => {
    expect(speedValue('foot', 10, 3000)).toBe(300);
    expect(speedValue('cycling', 30, 3600)).toBe(30);
    expect(speedValue('swim', 1, 1200)).toBe(120);
    expect(speedValue('other', 5, 1000)).toBeUndefined();
    expect(speedValue('foot', 0, 1000)).toBeUndefined();
  });
});

describe('activityLabel', () => {
  it('traduce los conocidos y humaniza el resto', () => {
    expect(activityLabel('strength_training')).toBe('Fuerza');
    expect(activityLabel('whitewater_rafting_v2')).toBe('Whitewater rafting');
  });
});
