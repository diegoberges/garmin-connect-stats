/**
 * Tabla accesible ("Ver datos") generada desde un ChartSpec: una fila por categoría con la banda (si la hay)
 * y una columna por serie, con el mismo formato que los ejes. Las filas sin ningún valor se omiten.
 */
import { fmt } from '../scripts/chart-options';
import type { ChartSpec } from './chart-spec';

type Cell = number | [number, number] | null | undefined;

export function specTable(spec: ChartSpec, categoryLabel = 'Fecha'): { headers: string[]; rows: string[][] } {
  const cell = (v: Cell) =>
    Array.isArray(v) ? `${fmt(spec.format, v[0])}–${fmt(spec.format, v[1])}` : fmt(spec.format, v);
  const headers = [categoryLabel, ...(spec.band ? [spec.band.name] : []), ...spec.series.map((s) => s.name)];
  const rows = spec.categories
    .map((cat, i) => {
      const values: Cell[] = [...(spec.band ? [spec.band.data[i]] : []), ...spec.series.map((s) => s.data[i])];
      return values.some((v) => v !== null && v !== undefined) ? [cat, ...values.map(cell)] : undefined;
    })
    .filter((r): r is string[] => r !== undefined);
  return { headers, rows };
}
