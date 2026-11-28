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

/**
 * Tabla de varias gráficas que comparten el eje x (las series sincronizadas del detalle de una actividad), agrupada en
 * tramos: una fila por tramo (cada `step` unidades de x) con la media de cada serie. Así la tabla es legible (un FIT
 * tiene cientos de puntos) y dice lo mismo que las gráficas.
 */
export function bucketTable(
  xs: number[],
  step: number,
  label: (start: number) => string,
  firstHeader: string,
  specs: { title: string; spec: ChartSpec }[],
): { headers: string[]; rows: string[][] } {
  const columns = specs.flatMap(({ title, spec }) =>
    spec.series.map((s) => ({
      header: spec.series.length > 1 ? `${title.replace(/\s*\(.*\)$/, '')} · ${s.name}` : title,
      data: s.data,
      format: spec.format,
    })),
  );
  const buckets = new Map<number, number[]>();
  xs.forEach((x, i) => {
    const b = Math.floor(x / step);
    buckets.set(b, [...(buckets.get(b) ?? []), i]);
  });
  const mean = (data: Cell[], idx: number[]) => {
    const vs = idx.map((i) => data[i]).filter((v): v is number => typeof v === 'number');
    return vs.length ? vs.reduce((a, v) => a + v, 0) / vs.length : undefined;
  };
  const rows = [...buckets.entries()].map(([b, idx]) => [
    label(b * step),
    ...columns.map((c) => fmt(c.format, mean(c.data, idx))),
  ]);
  return { headers: [firstHeader, ...columns.map((c) => c.header)], rows };
}
