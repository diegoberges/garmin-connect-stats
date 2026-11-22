/**
 * Peso: tendencia con la media de los 7 días anteriores (incluido el día), que amortigua el ruido de la
 * hidratación y de la hora del pesaje (informe del dashboard, P2).
 */
import { addDays } from './dates';

export interface WeightPoint {
  date: string;
  kg: number;
  /** media de los pesajes de los 7 días que acaban en `date` */
  avg7: number;
}

export function weightTrend(points: { date: string; kg: number }[]): WeightPoint[] {
  const sorted = points.toSorted((a, b) => a.date.localeCompare(b.date));
  return sorted.map((p) => {
    const from = addDays(p.date, -6);
    const win = sorted.filter((q) => q.date >= from && q.date <= p.date);
    return { ...p, avg7: win.reduce((a, q) => a + q.kg, 0) / win.length };
  });
}

/** Cambio de la media de 7 días entre el primer y el último punto del periodo (kg). */
export function weightChange(trend: WeightPoint[]): number | undefined {
  return trend.length >= 2 ? trend.at(-1)!.avg7 - trend[0].avg7 : undefined;
}
