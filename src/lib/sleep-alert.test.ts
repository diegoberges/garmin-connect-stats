import { describe, expect, it } from 'vitest';
import { addDays, dateRange } from './dates';
import type { DayHealth } from './garmin/types';
import {
  alertHistory,
  currentAlert,
  DEFAULT_THRESHOLDS,
  evaluateSleepFatigue,
  indexByDate,
  resolveThresholds,
  weeklySleepDebt,
} from './sleep-alert';

const H = 3600;
const TODAY = '2026-11-22';

/** 100 días "normales": 7,5 h de sueño, VFC ~72 ms con algo de ruido y FC en reposo 41. */
function normalDays(): DayHealth[] {
  return dateRange(addDays(TODAY, -99), TODAY).map((date, i) => ({
    date,
    sleepS: 7.5 * H,
    sleepNeedS: 8 * H,
    hrvLastNight: 72 + ((i % 5) - 2) * 3,
    restingHr: 41 + (i % 3) - 1,
  }));
}
const setSleep = (days: DayHealth[], date: string, hours: number | undefined) => {
  const d = days.find((x) => x.date === date)!;
  d.sleepS = hours === undefined ? undefined : hours * H;
};

describe('alerta de fatiga por sueño', () => {
  it('caso real del informe: carga baja y VFC/FC normales, pero sueño corto → aviso', () => {
    const days = normalDays();
    setSleep(days, TODAY, 4 + 55 / 60);
    setSleep(days, addDays(TODAY, -3), 6.2);
    setSleep(days, addDays(TODAY, -5), 5.8);
    const a = evaluateSleepFatigue(indexByDate(days), TODAY)!;
    expect(a.level).toBe('warning');
    expect(a.shortNights).toBe(3);
    expect(a.nightsWithData).toBe(7);
    expect(a.hrv).toBeUndefined();
    expect(a.rhr).toBeUndefined();
  });

  it('no salta con una sola noche corta', () => {
    const days = normalDays();
    setSleep(days, TODAY, 5);
    expect(evaluateSleepFatigue(indexByDate(days), TODAY)).toBeUndefined();
  });

  it('no salta si anoche se durmió lo suficiente aunque hubiera noches cortas', () => {
    const days = normalDays();
    setSleep(days, addDays(TODAY, -1), 5);
    setSleep(days, addDays(TODAY, -2), 5);
    expect(evaluateSleepFatigue(indexByDate(days), TODAY)).toBeUndefined();
  });

  it('una noche sin dato no cuenta como corta', () => {
    const days = normalDays();
    setSleep(days, TODAY, 5);
    setSleep(days, addDays(TODAY, -2), undefined);
    expect(evaluateSleepFatigue(indexByDate(days), TODAY)).toBeUndefined();
    setSleep(days, addDays(TODAY, -3), 6);
    const a = evaluateSleepFatigue(indexByDate(days), TODAY)!;
    expect(a.nightsWithData).toBe(6);
  });

  it('sin dato de anoche no evalúa', () => {
    const days = normalDays();
    setSleep(days, TODAY, undefined);
    expect(evaluateSleepFatigue(indexByDate(days), TODAY)).toBeUndefined();
  });

  it('escala a "alto" si la FC en reposo de 7 días sube 5 ppm o más', () => {
    const days = normalDays();
    setSleep(days, TODAY, 5);
    setSleep(days, addDays(TODAY, -1), 6);
    for (const d of days.slice(-7)) d.restingHr = 48;
    const a = evaluateSleepFatigue(indexByDate(days), TODAY)!;
    expect(a.level).toBe('high');
    expect(a.rhr?.base).toBe(41);
  });

  it('escala a "alto" si la VFC de 7 días cae por debajo de la línea base − 1 DE', () => {
    const days = normalDays();
    setSleep(days, TODAY, 5);
    setSleep(days, addDays(TODAY, -1), 6);
    for (const d of days.slice(-7)) d.hrvLastNight = 50;
    const a = evaluateSleepFatigue(indexByDate(days), TODAY)!;
    expect(a.level).toBe('high');
    expect(a.hrv!.avg7).toBeCloseTo(50);
  });

  it('deuda de 7 días con objetivo fijo o con la necesidad de Garmin', () => {
    const days = normalDays();
    setSleep(days, TODAY, 5);
    const byDate = indexByDate(days);
    // Necesidad de Garmin (8 h): 6 noches × 0,5 h + 3 h
    expect(weeklySleepDebt(byDate, TODAY, DEFAULT_THRESHOLDS) / H).toBeCloseTo(6);
    // Objetivo 7,5 h: solo la noche de hoy
    expect(weeklySleepDebt(byDate, TODAY, { ...DEFAULT_THRESHOLDS, sleepTargetH: 7.5 }) / H).toBeCloseTo(2.5);
    // Dormir de más no deja la deuda en negativo
    expect(weeklySleepDebt(indexByDate(normalDays()), TODAY, { ...DEFAULT_THRESHOLDS, sleepTargetH: 6 })).toBe(0);
  });

  it('hoy sin sincronizar: usa la noche de ayer', () => {
    const days = normalDays();
    setSleep(days, TODAY, undefined);
    setSleep(days, addDays(TODAY, -1), 5);
    setSleep(days, addDays(TODAY, -2), 6);
    const c = currentAlert(days, TODAY);
    expect(c.date).toBe(addDays(TODAY, -1));
    expect(c.alert?.level).toBe('warning');
  });

  it('histórico: un día por cada día que salta la regla', () => {
    const days = normalDays();
    setSleep(days, addDays(TODAY, -10), 5);
    setSleep(days, addDays(TODAY, -9), 5);
    setSleep(days, addDays(TODAY, -8), 7);
    const h = alertHistory(days, addDays(TODAY, -29), TODAY);
    expect(h.map((a) => a.date)).toEqual([addDays(TODAY, -9)]);
  });

  it('umbrales: aplica los guardados y descarta los que están fuera de rango', () => {
    const t = resolveThresholds({ lastNightH: 5.5, rhrBpm: 99, minShortNights: 3 });
    expect(t.lastNightH).toBe(5.5);
    expect(t.rhrBpm).toBe(DEFAULT_THRESHOLDS.rhrBpm);
    expect(t.minShortNights).toBe(3);
    expect(t.sleepTargetH).toBeUndefined();
  });
});
