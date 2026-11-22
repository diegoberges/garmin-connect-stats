/**
 * Monta las gráficas declaradas con data-chart (JSON de ChartSpec).
 * Colores desde los tokens CSS --viz-*; se vuelven a pintar al cambiar el tema.
 */
import ApexCharts from 'apexcharts';
import type { ChartSpec, ColorSlot, ValueFormat } from '../lib/chart-spec';

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const slot = (s: ColorSlot) => css(`--viz-${s}`);

function fmt(format: ValueFormat, v: number | null | undefined): string {
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

function options(spec: ChartSpec, width = window.innerWidth): ApexCharts.ApexOptions {
  const text = css('--viz-text');
  const muted = css('--viz-muted');
  const grid = css('--viz-grid');
  const surface = css('--viz-surface');
  const isBar = spec.type === 'bar' || spec.type === 'rangeBar';
  const colors = spec.series.map((s, i) => slot(s.color ?? (((i % 4) + 1) as ColorSlot)));
  const dense = spec.categories.length > 16;
  const narrow = window.innerWidth < 640;
  const time = timeScale(spec);
  const paceAxis = paceScale(spec);

  const band = spec.band && spec.type !== 'rangeBar' ? spec.band : undefined;
  const series = band
    ? // Banda (rangeArea) + líneas en formato {x, y}: así ApexCharts las combina en una sola gráfica
      [
        { type: 'rangeArea', name: band.name, data: spec.categories.map((x, i) => ({ x, y: band.data[i] ?? null })) },
        ...spec.series.map((s) => ({
          type: spec.type === 'area' ? 'area' : 'line',
          name: s.name,
          data: spec.categories.map((x, i) => ({ x, y: s.data[i] as number | null })),
        })),
      ]
    : spec.type === 'rangeBar'
      ? spec.series.map((s) => ({
          name: s.name,
          data: s.data.map((d, i) => ({ x: spec.categories[i], y: Array.isArray(d) ? d : null })),
        }))
      : spec.series.map((s) => ({ name: s.name, data: s.data as (number | null)[] }));
  // Series tenues: mismo color con transparencia; la banda va primero con su propio color
  const lineColors = spec.series.map((s, i) => (s.faint ? `${colors[i]}66` : colors[i]));
  const allColors = band ? [slot('seq-light'), ...lineColors] : lineColors;
  const widths = spec.series.map((s) => (s.faint ? 1.5 : 2));

  return {
    chart: {
      type: band ? 'rangeArea' : spec.type,
      height: spec.height ?? 260,
      stacked: spec.stacked,
      toolbar: { show: false },
      zoom: { enabled: false },
      fontFamily: 'inherit',
      foreColor: muted,
      background: 'transparent',
      animations: { enabled: false },
      parentHeightOffset: 0,
      ...(spec.group
        ? {
            group: spec.group,
            id: `${spec.group}-${spec.series[0]?.name ?? ''}-${Math.random().toString(36).slice(2, 7)}`,
          }
        : {}),
    },
    colors: allColors,
    series: series as ApexCharts.ApexOptions['series'],
    // 2px de separación entre segmentos/barras con el color de la superficie
    stroke: isBar
      ? { show: true, width: spec.stacked && !dense ? 2 : 0, colors: [surface] }
      : { curve: 'straight', width: band ? [0, ...widths] : widths },
    markers: isBar
      ? undefined
      : {
          // Sin puntos en la banda ni en las series tenues
          size: (() => {
            const base = spec.categories.length <= 31 ? 3 : 0;
            const perSeries = spec.series.map((s) => (s.faint ? 0 : base));
            return band ? [0, ...perSeries] : perSeries;
          })(),
          strokeWidth: 2,
          strokeColors: surface,
          hover: { size: 6 },
        },
    plotOptions: {
      bar: {
        borderRadius: 4,
        borderRadiusApplication: 'end',
        columnWidth: dense ? '70%' : '55%',
        horizontal: false,
      },
    },
    fill: { opacity: band ? [0.22, ...spec.series.map(() => 1)] : spec.type === 'area' ? 0.15 : 1 },
    dataLabels: { enabled: false },
    grid: { borderColor: grid, strokeDashArray: 0, xaxis: { lines: { show: false } }, padding: { left: 8, right: 8 } },
    xaxis: {
      categories: spec.type === 'rangeBar' || band ? undefined : spec.categories,
      type: 'category',
      labels: {
        show: !spec.hideXLabels,
        style: { colors: muted },
        rotate: 0,
        hideOverlappingLabels: true,
        trim: false,
      },
      // Una etiqueta cada ~90 px del ancho real de la gráfica, para que no se monten
      tickAmount: dense || narrow ? Math.max(3, Math.min(8, Math.floor(width / 90))) : undefined,
      axisBorder: { color: css('--viz-axis') },
      axisTicks: { show: false },
      tooltip: { enabled: false },
    },
    yaxis: {
      reversed: spec.reversed,
      min: time ? 0 : (paceAxis?.min ?? spec.yMin),
      max: time ? time.max : (paceAxis?.max ?? spec.yMax),
      tickAmount: time?.tickAmount ?? paceAxis?.tickAmount,
      forceNiceScale: !time && !paceAxis,
      // Ancho fijo en gráficas agrupadas para que los ejes x queden alineados
      labels: {
        minWidth: spec.group ? 56 : undefined,
        maxWidth: spec.group ? 56 : undefined,
        style: { colors: muted },
        formatter: (v: number) => fmt(spec.format, v).replace(/ \/(km|100 m)$/, ''),
      },
    },
    legend: {
      // Con banda también: si no, la franja sombreada aparece sin explicación
      show: spec.series.length > 1 || Boolean(band),
      position: 'top',
      horizontalAlign: 'left',
      labels: { colors: text },
      markers: { size: 6, shape: 'circle' },
      fontSize: '12px',
    },
    tooltip: {
      theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
      shared: !isBar || spec.stacked,
      intersect: false,
      y: { formatter: (v: number) => fmt(spec.format, v) },
    },
    annotations: spec.reference
      ? {
          yaxis: [
            {
              y: spec.reference.value,
              borderColor: muted,
              strokeDashArray: 4,
              label: { text: spec.reference.label, borderWidth: 0, style: { color: text, background: 'transparent' } },
            },
          ],
        }
      : undefined,
  };
}

const charts = new Map<HTMLElement, ApexCharts>();

function renderAll() {
  for (const el of document.querySelectorAll<HTMLElement>('[data-chart]')) {
    charts.get(el)?.destroy();
    const spec = JSON.parse(el.dataset.chart!) as ChartSpec;
    el.innerHTML = '';
    const chart = new ApexCharts(el, options(spec, el.clientWidth || window.innerWidth));
    chart.render();
    charts.set(el, chart);
  }
}

renderAll();
// Re-pintar con los tokens del tema nuevo al alternar claro/oscuro
let resizeTimer: ReturnType<typeof setTimeout> | undefined;
let lastWidth = window.innerWidth;
window.addEventListener('resize', () => {
  if (window.innerWidth === lastWidth) return;
  lastWidth = window.innerWidth;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(renderAll, 200);
});
new MutationObserver(renderAll).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
