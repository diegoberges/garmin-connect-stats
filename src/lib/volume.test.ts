import { describe, expect, it } from 'vitest';
import type { Activity } from './garmin/types';
import { inLoadScope, parseLoadScope, periodVolumes, sameDayPrevMonth, sportGroup, volumeBySport } from './volume';

const act = (date: string, typeKey: string, km = 10, over: Partial<Activity> = {}): Activity => ({
  id: 1,
  name: 'x',
  typeKey,
  startLocal: `${date} 08:00:00`,
  date,
  distanceKm: km,
  durationS: 3000,
  movingS: 3000,
  hrZonesS: [0, 0, 0, 0, 0],
  bestEfforts: {},
  isPr: false,
  ...over,
});

describe('volumen por deporte', () => {
  it('agrupa los tipos de Garmin', () => {
    expect(sportGroup('trail_running')).toBe('run');
    expect(sportGroup('treadmill_running')).toBe('run');
    expect(sportGroup('walking')).toBe('walk');
    expect(sportGroup('hiking')).toBe('walk');
    expect(sportGroup('road_biking')).toBe('cycling');
    expect(sportGroup('strength_training')).toBe('strength');
    expect(sportGroup('yoga')).toBe('other');
  });

  it('suma sesiones, km, tiempo y desnivel en el rango', () => {
    const v = volumeBySport(
      [
        act('2026-11-16', 'running', 10, { elevationGainM: 50 }),
        act('2026-11-18', 'trail_running', 8, { elevationGainM: 300 }),
        act('2026-11-25', 'running'),
      ],
      '2026-11-16',
      '2026-11-22',
    );
    expect(v.get('run')).toEqual({ sessions: 2, km: 18, timeS: 6000, elevationM: 350 });
  });

  it('mismo día del mes anterior, sin pasarse de fin de mes', () => {
    expect(sameDayPrevMonth('2026-11-22')).toBe('2026-10-22');
    expect(sameDayPrevMonth('2026-03-31')).toBe('2026-02-28');
    expect(sameDayPrevMonth('2026-01-15')).toBe('2025-12-15');
  });

  it('semana y mes en curso frente al mismo tramo anterior', () => {
    // Domingo 22/11/2026: semana desde el lunes 16; la anterior, del 9 al 15
    const [week, month] = periodVolumes(
      [act('2026-11-16', 'running'), act('2026-11-10', 'running', 5), act('2026-10-05', 'running', 7)],
      '2026-11-22',
    );
    expect(week.from).toBe('2026-11-16');
    expect([week.prevFrom, week.prevTo]).toEqual(['2026-11-09', '2026-11-15']);
    expect(week.current.get('run')!.km).toBe(10);
    expect(week.previous.get('run')!.km).toBe(5);
    expect([month.from, month.prevFrom, month.prevTo]).toEqual(['2026-11-01', '2026-10-01', '2026-10-22']);
    expect(month.current.get('run')!.km).toBe(15);
    expect(month.previous.get('run')!.km).toBe(7);
  });

  it('filtro de la carga', () => {
    const acts = [act('2026-11-16', 'running'), act('2026-11-16', 'walking'), act('2026-11-16', 'strength_training')];
    expect(acts.filter(inLoadScope('todas'))).toHaveLength(3);
    expect(acts.filter(inLoadScope('sin-caminar')).map((a) => a.typeKey)).toEqual(['running', 'strength_training']);
    expect(acts.filter(inLoadScope('carrera')).map((a) => a.typeKey)).toEqual(['running']);
    expect(parseLoadScope('nada')).toBe('todas');
    expect(parseLoadScope('carrera')).toBe('carrera');
  });
});
