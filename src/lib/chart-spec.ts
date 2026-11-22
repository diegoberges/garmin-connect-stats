/**
 * Especificación serializable de una gráfica: la página la genera en el servidor y
 * src/scripts/charts.ts la convierte en opciones de ApexCharts en el navegador.
 */
export type ValueFormat = 'int' | 'km' | 'pace' | 'pace100' | 'kmh' | 'hm' | 'bpm' | 'ms' | 'pct';

export type ColorSlot = 1 | 2 | 3 | 4 | 'seq-light';

export interface ChartSeries {
  name: string;
  /** Para 'rangeBar': [min, max] por categoría */
  data: (number | null | [number, number] | null)[];
  color?: ColorSlot;
}

export interface ChartSpec {
  type: 'bar' | 'line' | 'area' | 'rangeBar';
  categories: string[];
  series: ChartSeries[];
  format: ValueFormat;
  stacked?: boolean;
  /** Para ritmo: más rápido arriba. */
  reversed?: boolean;
  yMin?: number;
  yMax?: number;
  height?: number;
  /** Línea horizontal de referencia (p. ej. objetivo de pasos). */
  reference?: { value: number; label: string };
}
