import { describe, expect, it } from 'vitest';
import { addDays, dateRange } from './dates';
import type { DayHealth } from './garmin/types';
import {
  bmi,
  bmiCategory,
  minutesFromNoon,
  quarterChange,
  yearRange,
  sleepNights,
  sleepRegularity,
  weeklyMean,
} from './long-term';

/** Epoch "local" (Garmin: hora local como si fuera UTC) de una fecha y hora. */
const local = (date: string, hhmm: string) => Date.parse(`${date}T${hhmm}:00Z`);
const TODAY = '2026-11-22'; // domingo

/** 30 noches: acostarse y levantarse a horas fijas entre semana y más tarde el fin de semana. */
function nights(bedWork: string, wakeWork: string, bedFree: string, wakeFree: string): DayHealth[] {
  return dateRange(addDays(TODAY, -29), TODAY).map((date) => {
    const free = [0, 6].includes(new Date(`${date}T12:00:00Z`).getUTCDay());
    const prev = addDays(date, -1);
    const [bed, wake] = free ? [bedFree, wakeFree] : [bedWork, wakeWork];
    // Acostarse antes de medianoche → la fecha anterior
    const bedDate = bed >= '12:00' ? prev : date;
    return { date, sleepStartLocal: local(bedDate, bed), sleepEndLocal: local(date, wake) };
  });
}

describe('regularidad del sueño', () => {
  it('minutos desde las 12:00: la noche no se parte en la medianoche', () => {
    expect(minutesFromNoon(local('2026-11-21', '23:00'))).toBe(660);
    expect(minutesFromNoon(local('2026-11-22', '01:30'))).toBe(810);
    expect(minutesFromNoon(local('2026-11-22', '07:00'))).toBe(1140);
  });

  it('horario fijo: regular y sin jet lag social', () => {
    const r = sleepRegularity(nights('23:00', '07:00', '23:00', '07:00'), TODAY)!;
    expect(r.nights).toHaveLength(30);
    expect(r.sdBed).toBe(0);
    expect(r.sdWake).toBe(0);
    expect(r.socialJetlag).toBe(0);
    expect(r.label).toBe('Regular');
    expect(r.meanBed).toBe(660);
  });

  it('fines de semana dos horas más tarde: jet lag social de 2 h', () => {
    const r = sleepRegularity(nights('23:00', '07:00', '01:00', '09:00'), TODAY)!;
    expect(r.socialJetlag).toBeCloseTo(120, 5);
    expect(r.label).not.toBe('Regular');
  });

  it('acostarse pasada la medianoche y levantarse tras el mediodía', () => {
    const n = sleepNights(
      [{ date: TODAY, sleepStartLocal: local(TODAY, '04:00'), sleepEndLocal: local(TODAY, '13:00') }],
      TODAY,
    );
    // 04:00 = 960; 13:00 = 60 + 1440
    expect(n[0]).toEqual({ date: TODAY, bed: 960, wake: 1500 });
  });

  it('con menos de 10 noches no hay valoración', () => {
    expect(sleepRegularity(nights('23:00', '07:00', '23:00', '07:00').slice(-5), TODAY)).toBeUndefined();
  });
});

describe('medias semanales a 12 meses', () => {
  const days = dateRange(addDays(TODAY, -363), TODAY).map((date, i) => ({
    date,
    restingHr: i < 182 ? 45 : 42,
    hrvLastNight: i % 2 ? 50 : 72,
  }));

  it('FC en reposo: media aritmética; VFC: geométrica', () => {
    const rhr = weeklyMean(days, (d) => d.restingHr, 52, TODAY);
    expect(rhr).toHaveLength(52);
    expect(rhr[0].value).toBe(45);
    expect(rhr.at(-1)!.value).toBe(42);
    const hrv = weeklyMean(days, (d) => d.hrvLastNight, 52, TODAY, true);
    // Media geométrica de los 7 valores de esa semana (menor que la aritmética)
    const week = days.filter((d) => d.date >= hrv[10].week && d.date <= addDays(hrv[10].week, 6));
    const logs = week.map((d) => Math.log(d.hrvLastNight));
    expect(hrv[10].value).toBeCloseTo(Math.exp(logs.reduce((a, b) => a + b, 0) / logs.length), 5);
    expect(hrv[10].value!).toBeLessThan(week.reduce((a, d) => a + d.hrvLastNight, 0) / week.length);
  });

  it('cambio entre el primer y el último trimestre', () => {
    const c = quarterChange(weeklyMean(days, (d) => d.restingHr, 52, TODAY))!;
    expect(c.first).toBe(45);
    expect(c.last).toBe(42);
    expect(c.diff).toBe(-3);
    expect(quarterChange(weeklyMean([], (d) => d.restingHr, 52, TODAY))).toBeUndefined();
  });
});

describe('rango del año', () => {
  it('media ± 1 DE de las medias semanales; sin 8 semanas, nada', () => {
    const weeks = [40, 42, 44, 40, 42, 44, 40, 42].map((value, i) => ({ week: `w${i}`, value, days: 7 }));
    const r = yearRange(weeks)!;
    expect((r.low + r.high) / 2).toBeCloseTo(41.75, 5);
    expect(r.high - r.low).toBeGreaterThan(2);
    expect(yearRange(weeks.slice(0, 7))).toBeUndefined();
  });
});

describe('IMC', () => {
  it('kg / m² y categorías de la OMS', () => {
    expect(bmi(70, 175)).toBeCloseTo(22.86, 2);
    expect(bmiCategory(17)).toBe('Bajo peso');
    expect(bmiCategory(22.9)).toBe('Normal');
    expect(bmiCategory(27)).toBe('Sobrepeso');
    expect(bmiCategory(31)).toBe('Obesidad');
  });
});
