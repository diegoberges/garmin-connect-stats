import { describe, expect, it } from 'vitest';
import type { ChartSpec } from './chart-spec';
import { specTable } from './chart-table';

describe('specTable', () => {
  const spec: ChartSpec = {
    type: 'line',
    categories: ['1 nov', '2 nov', '3 nov'],
    band: { name: 'Rango', data: [[40, 50], null, null] },
    series: [
      { name: 'A', data: [45, null, null] },
      { name: 'B', data: [null, 60, null] },
    ],
    format: 'bpm',
  };

  it('una columna por serie, la banda como rango y sin filas vacías', () => {
    const t = specTable(spec, 'Día');
    expect(t.headers).toEqual(['Día', 'Rango', 'A', 'B']);
    expect(t.rows).toEqual([
      ['1 nov', '40 ppm–50 ppm', '45 ppm', '—'],
      ['2 nov', '—', '—', '60 ppm'],
    ]);
  });

  it('rangeBar: cada valor es un par', () => {
    const t = specTable({
      type: 'rangeBar',
      categories: ['x'],
      series: [{ name: 'R', data: [[1, 2]] }],
      format: 'int',
    });
    expect(t.rows).toEqual([['x', '1–2']]);
  });
});
