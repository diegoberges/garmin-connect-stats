/**
 * Rendimiento: "¿Estás mejorando?". Reúne en una lectura cuatro señales de progreso que la página ya calcula,
 * cada una frente a hace 6 semanas (o a tu histórico, en las marcas):
 *  - eficiencia (ritmo a tu FC habitual de rodaje): ±1 % se considera estable;
 *  - VO2máx estimado (media de 28 días): ±0,5 ml/kg/min estable (por debajo del ruido de la estimación);
 *  - marcas: cuántas de tus mejores marcas históricas son de los últimos 12 meses;
 *  - forma física (carga media de 42 días): ±5 % estable.
 * Umbrales orientativos; el veredicto solo cuenta señales a favor y en contra, no las pondera.
 */
export const PROGRESS_THRESHOLDS = { efficiencyPct: 1, vo2: 0.5, fitnessPct: 5 } as const;

export type ProgressDir = 'better' | 'same' | 'worse';

/** Dirección de un cambio: dentro de ±umbral, estable. `higherIsBetter` false para lo que mejora al bajar. */
export function trendDir(
  change: number | undefined,
  threshold: number,
  higherIsBetter = true,
): ProgressDir | undefined {
  if (change === undefined || !Number.isFinite(change)) return undefined;
  if (Math.abs(change) < threshold) return 'same';
  return change > 0 === higherIsBetter ? 'better' : 'worse';
}

/** Cambio relativo en % (undefined si falta alguno o la base es 0). */
export function pctChange(now: number | undefined, before: number | undefined): number | undefined {
  if (now === undefined || before === undefined || before === 0) return undefined;
  return ((now - before) / before) * 100;
}

/** Marcas de los últimos 12 meses que igualan o superan la mejor histórica en su distancia. */
export function recordsThisYear(rows: { period?: { timeS: number }; best?: { timeS: number } }[]): {
  count: number;
  total: number;
} {
  const withBest = rows.filter((r) => r.best);
  const count = withBest.filter((r) => r.period && r.period.timeS <= r.best!.timeS).length;
  return { count, total: withBest.length };
}

export type ProgressVerdict = { title: string; tone: 'ok' | 'warn' | 'muted' };

/** Veredicto a partir de las direcciones disponibles (al menos 2). */
export function progressVerdict(dirs: (ProgressDir | undefined)[]): ProgressVerdict {
  const known = dirs.filter((d): d is ProgressDir => d !== undefined);
  if (known.length < 2) return { title: 'Aún no hay datos para saberlo', tone: 'muted' };
  const better = known.filter((d) => d === 'better').length;
  const worse = known.filter((d) => d === 'worse').length;
  if (better >= 2 && worse === 0) return { title: 'Sí, estás mejorando', tone: 'ok' };
  if (worse >= 2 && better === 0) return { title: 'Vas a menos', tone: 'warn' };
  if (better === 0 && worse === 0) return { title: 'Estable: ni mejoras ni empeoras', tone: 'muted' };
  return { title: `Señales mixtas: ${better} a favor y ${worse} en contra`, tone: 'muted' };
}
