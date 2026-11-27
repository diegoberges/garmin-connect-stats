/**
 * Traduce un ChartSpec a opciones de ApexCharts. Sin acceso al DOM: los colores del tema y el ancho
 * llegan en `env`, así que se puede probar en Node. Lo usa src/scripts/charts.ts.
 */
import type ApexCharts from 'apexcharts';
import type { ChartSpec, ColorSlot, ValueFormat } from '../lib/chart-spec';

export interface ChartEnv {
  /** valor de una variable CSS del tema (--viz-*) */
  css: (name: string) => string;
  /** ancho real del contenedor de la gráfica (px) */
  width: number;
  /** ancho de la ventana (px), para el modo móvil */
  viewportWidth: number;
  dark: boolean;
  /** puntero táctil (pointer: coarse) */
  coarse?: boolean;
}

type Band = NonNullable<ChartSpec['band']>;
type Options = ApexCharts.ApexOptions;

export function fmt(format: ValueFormat, v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  switch (format) {
    case 'pace':
    case 'pace100': {
      const t = Math.round(v);
      return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')} ${format === 'pace' ? '/km' : '/100 m'}`;
    }
    case 'dec2':
      return v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    case 'dec1':
      return v.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    case 'kmh':
      return `${v.toLocaleString('es-ES', { maximumFractionDigits: 1 })} km/h`;
    case 'hm': {
      const m = Math.round(v / 60);
      // El cero del eje, sin unidad: "0 min" junto a "2 h" confunde
      if (m === 0) return '0';
      if (m < 60) return `${m} min`;
      return m % 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m / 60} h`;
    }
    case 'km':
      return `${v.toLocaleString('es-ES', { maximumFractionDigits: 1 })} km`;
    case 'bpm':
      return `${Math.round(v)} ppm`;
    case 'ms':
      return `${Math.round(v)} ms`;
    case 'pct':
      return `${Math.round(v)} %`;
    case 'clock': {
      const m = (((Math.round(v) + 720) % 1440) + 1440) % 1440;
      return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    }
    default:
      return Math.round(v).toLocaleString('es-ES');
  }
}

/** Escala de tiempo en pasos redondos (5, 10, 15, 30 min, 1 h, 2 h…) con ≤ 6 marcas. */
function timeScale(spec: ChartSpec): { max: number; tickAmount: number } | undefined {
  if (spec.format !== 'hm') return undefined;
  const values = spec.series.map((s) => s.data.map((d) => (typeof d === 'number' ? d : 0)));
  const max = spec.stacked
    ? Math.max(0, ...spec.categories.map((_, i) => values.reduce((a, col) => a + (col[i] ?? 0), 0)))
    : Math.max(0, ...values.flat());
  if (!max) return undefined;
  const step = [300, 600, 900, 1800, 3600, 7200, 10800].find((st) => max / st <= 5) ?? 14400;
  const ticks = Math.ceil(max / step);
  return { max: ticks * step, tickAmount: ticks };
}

/** Escala de ritmo en pasos redondos (15 s, 30 s, 1 min…) con ≤ 6 marcas. */
function paceScale(spec: ChartSpec): { min: number; max: number; tickAmount: number } | undefined {
  if (spec.format !== 'pace' && spec.format !== 'pace100') return undefined;
  const xs = spec.series.flatMap((s) => s.data.filter((d): d is number => typeof d === 'number'));
  if (!xs.length) return undefined;
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  const step = [15, 30, 60, 120, 300].find((st) => (hi - lo) / st <= 5) ?? 600;
  const min = Math.floor(lo / step) * step;
  const max = Math.max(Math.ceil(hi / step) * step, min + step);
  return { min, max, tickAmount: (max - min) / step };
}

const isBarSpec = (spec: ChartSpec) => spec.type === 'bar' || spec.type === 'rangeBar';
const isDense = (spec: ChartSpec) => spec.categories.length > 16;
const bandOf = (spec: ChartSpec): Band | undefined => (spec.type === 'rangeBar' ? undefined : spec.band);

/** Banda (rangeArea) + líneas en formato {x, y}: así ApexCharts las combina en una sola gráfica. */
function bandSeries(spec: ChartSpec, band: Band) {
  return [
    { type: 'rangeArea', name: band.name, data: spec.categories.map((x, i) => ({ x, y: band.data[i] ?? null })) },
    ...spec.series.map((s) => ({
      type: spec.type === 'area' ? 'area' : 'line',
      name: s.name,
      data: spec.categories.map((x, i) => ({ x, y: s.data[i] as number | null })),
    })),
  ];
}

function buildSeries(spec: ChartSpec, band: Band | undefined) {
  if (band) return bandSeries(spec, band);
  if (spec.type === 'rangeBar') {
    return spec.series.map((s) => ({
      name: s.name,
      data: s.data.map((d, i) => ({ x: spec.categories[i], y: Array.isArray(d) ? d : null })),
    }));
  }
  return spec.series.map((s) => ({ name: s.name, data: s.data as (number | null)[] }));
}

/** Colores por serie; las tenues con transparencia y la banda, si la hay, primero con su propio color. */
function seriesColors(spec: ChartSpec, env: ChartEnv, band: Band | undefined): string[] {
  const slot = (s: ColorSlot) => env.css(`--viz-${s}`);
  const colors = spec.series.map((s, i) => {
    const c = slot(s.color ?? (((i % 4) + 1) as ColorSlot));
    return s.faint ? `${c}cc` : c;
  });
  return band ? [slot('seq-light'), ...colors] : colors;
}

function strokeOf(spec: ChartSpec, env: ChartEnv, band: Band | undefined): Options['stroke'] {
  // 2px de separación entre segmentos/barras con el color de la superficie
  if (isBarSpec(spec)) {
    return { show: true, width: spec.stacked && !isDense(spec) ? 2 : 0, colors: [env.css('--viz-surface')] };
  }
  const widths = spec.series.map((s) => (s.faint ? 1.5 : 2));
  // Las tenues, discontinuas: así no dependen solo de un tono más claro del mismo color
  const dashes = spec.series.map((s) => (s.faint ? 4 : 0));
  return {
    curve: 'straight',
    width: band ? [0, ...widths] : widths,
    dashArray: band ? [0, ...dashes] : dashes,
  };
}

function markersOf(spec: ChartSpec, env: ChartEnv, band: Band | undefined): Options['markers'] {
  if (isBarSpec(spec)) return undefined;
  // Sin puntos en la banda ni en las series tenues
  const base = spec.categories.length <= 31 ? 3 : 0;
  const perSeries = spec.series.map((s) => ((s.points ?? !s.faint) ? base : 0));
  return {
    size: band ? [0, ...perSeries] : perSeries,
    strokeWidth: 2,
    strokeColors: env.css('--viz-surface'),
    hover: { size: 6 },
  };
}

function fillOf(spec: ChartSpec, env: ChartEnv, band: Band | undefined): Options['fill'] {
  // En oscuro la banda necesita algo más de opacidad para leerse sobre la tarjeta
  if (band) return { opacity: [env.dark ? 0.32 : 0.22, ...spec.series.map(() => 1)] };
  return { opacity: spec.type === 'area' ? 0.15 : 1 };
}

function xAxisOf(spec: ChartSpec, env: ChartEnv, band: Band | undefined): Options['xaxis'] {
  const muted = env.css('--viz-muted');
  // Ancho de etiqueta según la más larga (~9 px por carácter a 12 px, con holgura; mínimo 70, el de "28 oct")
  const longest = Math.max(0, ...spec.categories.map((c) => c.length));
  const labelPx = Math.max(70, Math.round(longest * 9 + 16));
  // Muchas categorías, pantalla estrecha o gráfica a media anchura
  const crowded = isDense(spec) || env.viewportWidth < 640 || spec.categories.length * labelPx > env.width;
  return {
    categories: spec.type === 'rangeBar' || band ? undefined : spec.categories,
    type: 'category',
    // El zoom por selección en un eje de categorías solo funciona con las marcas sobre los puntos
    ...(spec.zoom ? { tickPlacement: 'on' as const } : {}),
    labels: { show: !spec.hideXLabels, style: { colors: muted }, rotate: 0, hideOverlappingLabels: true, trim: false },
    // Una etiqueta por cada hueco de su ancho más 20 px del ancho real de la gráfica, para que no se monten
    tickAmount: crowded ? Math.max(3, Math.min(8, Math.floor(env.width / (labelPx + 20)))) : undefined,
    axisBorder: { color: env.css('--viz-axis') },
    axisTicks: { show: false },
    tooltip: { enabled: false },
  };
}

/** Límites del eje Y: escala de tiempo, de ritmo o la que fije el spec. */
/** Valores de un punto: uno, los dos de un rango [mín, máx] o ninguno. */
function pointValues(d: number | [number, number] | null): number[] {
  if (d === null) return [];
  return Array.isArray(d) ? d : [d];
}

/** Hora del día: de hora en hora (o cada 2 h si el rango es amplio), con margen de una hora. */
function clockScale(spec: ChartSpec): { min: number; max: number; tickAmount: number } | undefined {
  if (spec.format !== 'clock') return undefined;
  const values = spec.series.flatMap((s) => s.data.flatMap(pointValues));
  if (!values.length) return undefined;
  const min = Math.floor(Math.min(...values) / 60) * 60;
  const max = Math.ceil(Math.max(...values) / 60) * 60;
  const step = max - min > 8 * 60 ? 120 : 60;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  return { min: lo, max: hi, tickAmount: (hi - lo) / step };
}

function yRange(spec: ChartSpec) {
  const clock = clockScale(spec);
  if (clock) return { ...clock, nice: false };
  const time = timeScale(spec);
  if (time) return { min: 0, max: time.max, tickAmount: time.tickAmount, nice: false };
  const pace = paceScale(spec);
  if (pace) return { min: pace.min, max: pace.max, tickAmount: pace.tickAmount, nice: false };
  const span = spanScale(spec);
  if (span) return { ...span, tickAmount: spec.yTicks, nice: true };
  return { min: spec.yMin, max: spec.yMax, tickAmount: spec.yTicks, nice: true };
}

/** Con `minSpan`: si los datos (y la banda) ocupan menos, el eje se abre a esa amplitud centrada en ellos. */
function spanScale(spec: ChartSpec): { min: number; max: number } | undefined {
  if (!spec.minSpan) return undefined;
  const values = [...spec.series.flatMap((s) => s.data), ...(spec.band?.data ?? [])].flatMap(pointValues);
  if (!values.length) return undefined;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  if (hi - lo >= spec.minSpan) return undefined;
  // Centrado en los datos y en múltiplos de 5, para que las marcas del eje sean redondas
  const min = Math.floor(((lo + hi) / 2 - spec.minSpan / 2) / 5) * 5;
  return { min, max: Math.max(min + spec.minSpan, Math.ceil(hi / 5) * 5) };
}

function yAxisOf(spec: ChartSpec, env: ChartEnv): Options['yaxis'] {
  const range = yRange(spec);
  // Ancho fijo en gráficas agrupadas para que los ejes x queden alineados
  const labelWidth = spec.group ? 56 : undefined;
  return {
    reversed: spec.reversed,
    min: range.min,
    max: range.max,
    tickAmount: range.tickAmount,
    forceNiceScale: range.nice,
    labels: {
      minWidth: labelWidth,
      maxWidth: labelWidth,
      style: { colors: env.css('--viz-muted') },
      formatter: (v: number) => fmt(spec.format, v).replace(/ \/(km|100 m)$/, ''),
    },
  };
}

function annotationsOf(spec: ChartSpec, env: ChartEnv): Options['annotations'] {
  if (!spec.reference) return undefined;
  return {
    yaxis: [
      {
        y: spec.reference.value,
        borderColor: env.css('--viz-muted'),
        strokeDashArray: 4,
        label: {
          text: spec.reference.label,
          borderWidth: 0,
          // Sobre el fondo de la tarjeta: legible aunque caiga encima de las barras
          style: { color: env.css('--viz-text'), background: env.css('--viz-surface') },
        },
      },
    ],
  };
}

/** Las gráficas del mismo grupo comparten cursor; cada una necesita un id propio. */
function groupOf(spec: ChartSpec) {
  if (!spec.group) return {};
  return {
    group: spec.group,
    id: `${spec.group}-${spec.series[0]?.name ?? ''}-${Math.random().toString(36).slice(2, 7)}`,
  };
}

/** Zoom por selección en x con solo el botón de restablecer (sin descargas ni otras herramientas). */
function zoomOf(spec: ChartSpec) {
  if (!spec.zoom) return { toolbar: { show: false }, zoom: { enabled: false } };
  return {
    toolbar: {
      show: spec.zoomControls !== false,
      autoSelected: 'zoom' as const,
      tools: { download: false, selection: false, zoom: true, zoomin: false, zoomout: false, pan: false, reset: true },
    },
    zoom: { enabled: true, type: 'x' as const, autoScaleYaxis: true },
  };
}

export function buildOptions(spec: ChartSpec, env: ChartEnv): Options {
  const band = bandOf(spec);
  const isBar = isBarSpec(spec);
  return {
    chart: {
      type: band ? 'rangeArea' : spec.type,
      height: spec.height ?? 260,
      stacked: spec.stacked,
      ...zoomOf(spec),
      fontFamily: 'inherit',
      foreColor: env.css('--viz-muted'),
      background: 'transparent',
      animations: { enabled: false },
      parentHeightOffset: 0,
      ...groupOf(spec),
    },
    colors: seriesColors(spec, env, band),
    series: buildSeries(spec, band) as Options['series'],
    stroke: strokeOf(spec, env, band),
    markers: markersOf(spec, env, band),
    plotOptions: {
      bar: {
        borderRadius: 4,
        borderRadiusApplication: 'end',
        columnWidth: isDense(spec) ? '70%' : '55%',
        horizontal: false,
      },
    },
    fill: fillOf(spec, env, band),
    dataLabels: { enabled: false },
    grid: {
      borderColor: env.css('--viz-grid'),
      strokeDashArray: 0,
      xaxis: { lines: { show: false } },
      padding: { left: 8, right: 8 },
    },
    xaxis: xAxisOf(spec, env, band),
    yaxis: yAxisOf(spec, env),
    legend: {
      // Con banda también: si no, la franja sombreada aparece sin explicación
      show: spec.series.length > 1 || Boolean(band),
      position: 'top',
      horizontalAlign: 'left',
      labels: { colors: env.css('--viz-text') },
      // Banda: cuadrado; serie tenue: línea (discontinua en la gráfica); el resto, círculo
      markers: {
        size: 6,
        shape: [
          ...(band ? ['square' as const] : []),
          ...spec.series.map((s) => (s.faint ? ('line' as const) : ('circle' as const))),
        ],
      },
      onItemClick: { toggleDataSeries: !env.coarse },
      fontSize: '12px',
    },
    tooltip: {
      theme: env.dark ? 'dark' : 'light',
      shared: !isBar || spec.stacked,
      intersect: false,
      y: { formatter: (v: number) => fmt(spec.format, v) },
    },
    annotations: annotationsOf(spec, env),
  };
}
