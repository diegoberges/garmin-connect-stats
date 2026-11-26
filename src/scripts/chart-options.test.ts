import { describe, expect, it } from 'vitest';
import type { ChartSpec } from '../lib/chart-spec';
import { buildOptions, fmt, type ChartEnv } from './chart-options';

const env: ChartEnv = { css: (n) => `var(${n})`, width: 900, viewportWidth: 1280, dark: false };
const cats = (n: number) => Array.from({ length: n }, (_, i) => `d${i}`);

describe('fmt', () => {
  it('formatos en español', () => {
    expect(fmt('pace', 305)).toBe('5:05 /km');
    expect(fmt('pace100', 95)).toBe('1:35 /100 m');
    expect(fmt('hm', 5400)).toBe('1 h 30');
    expect(fmt('hm', 0)).toBe('0');
    expect(fmt('km', 12.34)).toBe('12,3 km');
    expect(fmt('dec2', 1.2)).toBe('1,20');
    expect(fmt('int', null)).toBe('—');
    // Minutos desde las 12:00: 660 = 23:00, 780 = 01:00 del día siguiente, 1140 = 07:00
    expect(fmt('clock', 660)).toBe('23:00');
    expect(fmt('clock', 780)).toBe('01:00');
    expect(fmt('clock', 1140)).toBe('07:00');
  });
});

describe('buildOptions', () => {
  it('zoom solo si se pide, con el botón de restablecer y sin descargas', () => {
    const base: ChartSpec = {
      type: 'line',
      categories: cats(5),
      series: [{ name: 'A', data: [1, 2, 3, 4, 5] }],
      format: 'int',
    };
    expect(buildOptions(base, env).chart?.zoom?.enabled).toBe(false);
    expect(buildOptions(base, env).chart?.toolbar?.show).toBe(false);
    const z = buildOptions({ ...base, zoom: true, group: 'g' }, env).chart!;
    expect(z.zoom?.enabled).toBe(true);
    expect(z.zoom?.type).toBe('x');
    expect(z.toolbar?.show).toBe(true);
    expect(z.toolbar?.tools?.reset).toBe(true);
    expect(z.toolbar?.tools?.download).toBe(false);
    expect(buildOptions({ ...base, zoom: true, zoomControls: false }, env).chart?.toolbar?.show).toBe(false);
  });

  it('con banda: rangeArea, leyenda visible y la banda sin puntos ni trazo', () => {
    const spec: ChartSpec = {
      type: 'line',
      categories: cats(10),
      band: { name: 'Rango', data: cats(10).map(() => [1, 2]) },
      series: [{ name: 'Valor', data: cats(10).map(() => 1.5) }],
      format: 'int',
    };
    const o = buildOptions(spec, env);
    expect(o.chart?.type).toBe('rangeArea');
    expect(o.legend?.show).toBe(true);
    expect((o.markers as { size: number[] }).size[0]).toBe(0);
    expect((o.stroke as { width: number[] }).width[0]).toBe(0);
    expect(o.xaxis?.categories).toBeUndefined();
  });

  it('ritmo: eje invertido con pasos redondos', () => {
    const spec: ChartSpec = {
      type: 'line',
      categories: cats(3),
      series: [{ name: 'R', data: [301, 322, 338] }],
      format: 'pace',
      reversed: true,
    };
    const y = buildOptions(spec, env).yaxis as { reversed: boolean; min: number; max: number; forceNiceScale: boolean };
    expect(y.reversed).toBe(true);
    expect([y.min, y.max]).toEqual([300, 345]);
    expect(y.forceNiceScale).toBe(false);
  });

  it('series tenues: color translúcido y sin puntos', () => {
    const spec: ChartSpec = {
      type: 'line',
      categories: cats(5),
      series: [
        { name: 'A', data: [1, 2, 3, 4, 5], color: 1 },
        { name: 'B', data: [1, 2, 3, 4, 5], color: 1, faint: true },
      ],
      format: 'int',
    };
    const o = buildOptions(spec, env);
    expect(o.colors).toEqual(['var(--viz-1)', 'var(--viz-1)cc']);
    expect((o.markers as { size: number[] }).size).toEqual([3, 0]);
    expect((o.stroke as { dashArray: number[] }).dashArray).toEqual([0, 4]);
    expect((o.legend as { markers: { shape: string[] } }).markers.shape).toEqual(['circle', 'line']);
  });

  it('amplitud mínima del eje: datos estables no parecen grandes cambios', () => {
    const spec: ChartSpec = {
      type: 'line',
      categories: cats(3),
      series: [{ name: 'FC', data: [41, 42, 43] }],
      format: 'bpm',
      minSpan: 10,
    };
    const y = buildOptions(spec, env).yaxis as { min: number; max: number };
    expect(y.max - y.min).toBe(10);
    expect(y.min).toBe(35);
  });

  it('etiquetas del eje x según el ancho real cuando hay muchas categorías', () => {
    const spec: ChartSpec = {
      type: 'bar',
      categories: cats(30),
      series: [{ name: 'A', data: cats(30).map(() => 1) }],
      format: 'int',
    };
    expect(buildOptions(spec, { ...env, width: 900 }).xaxis?.tickAmount).toBe(8);
    expect(buildOptions(spec, { ...env, width: 300 }).xaxis?.tickAmount).toBe(3);
  });
});
