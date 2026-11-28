import { describe, expect, it } from 'vitest';
import type { ChartSpec } from './chart-spec';
import { bucketTable, specTable } from './chart-table';

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

describe('bucketTable', () => {
  it('una fila por tramo con la media de cada serie de cada gráfica', () => {
    const xs = [0.2, 0.6, 1.1, 1.7];
    const t = bucketTable(xs, 1, (s) => `${s}–${s + 1} km`, 'Km', [
      {
        title: 'FC',
        spec: { type: 'line', categories: [], format: 'bpm', series: [{ name: 'FC', data: [140, 150, 160, null] }] },
      },
      {
        title: 'Ritmo (min/km)',
        spec: {
          type: 'line',
          categories: [],
          format: 'pace',
          series: [
            { name: 'Ritmo', data: [300, 300, 360, 360] },
            { name: 'GAP', data: [290, 290, null, null] },
          ],
        },
      },
    ]);
    expect(t.headers).toEqual(['Km', 'FC', 'Ritmo · Ritmo', 'Ritmo · GAP']);
    expect(t.rows).toHaveLength(2);
    expect(t.rows[0][0]).toBe('0–1 km');
    expect(t.rows[1][1]).toContain('160');
    expect(t.rows[1][3]).toBe('—');
  });
});
