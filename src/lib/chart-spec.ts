/**
 * Especificación serializable de una gráfica: la página la genera en el servidor y
 * src/scripts/charts.ts la convierte en opciones de ApexCharts en el navegador.
 */
export type ValueFormat = 'int' | 'dec1' | 'dec2' | 'km' | 'pace' | 'pace100' | 'kmh' | 'hm' | 'bpm' | 'ms' | 'pct';

export type ColorSlot = 1 | 2 | 3 | 4 | 'seq-light';

export interface ChartSeries {
  name: string;
  /** Para 'rangeBar': [min, max] por categoría */
  data: (number | [number, number] | null)[];
  color?: ColorSlot;
  /** Línea fina y translúcida (p. ej. el valor diario detrás de la media de 7 días). */
  faint?: boolean;
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
  /** Banda sombreada de rango normal detrás de las series ([mín, máx] por categoría). */
  band?: { name: string; data: ([number, number] | null)[] };
  /** Gráficas con el mismo grupo comparten el cursor (mismo eje x). */
  group?: string;
  /** Oculta las etiquetas del eje x (en gráficas apiladas solo la de abajo las muestra). */
  hideXLabels?: boolean;
  /** Zoom por selección en el eje x (arrastrando), con botón para restablecer; se sincroniza en el grupo. */
  zoom?: boolean;
  /** Con zoom: muestra los botones (lupa y restablecer). En un grupo basta con mostrarlos en una gráfica. */
  zoomControls?: boolean;
}
