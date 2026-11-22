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

function options(spec: ChartSpec): ApexCharts.ApexOptions {
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

  const series =
    spec.type === 'rangeBar'
      ? spec.series.map((s) => ({
          name: s.name,
          data: s.data.map((d, i) => ({ x: spec.categories[i], y: Array.isArray(d) ? d : null })),
        }))
      : spec.series.map((s) => ({ name: s.name, data: s.data as (number | null)[] }));

  return {
    chart: {
      type: spec.type,
      height: spec.height ?? 260,
      stacked: spec.stacked,
      toolbar: { show: false },
      zoom: { enabled: false },
      fontFamily: 'inherit',
      foreColor: muted,
      background: 'transparent',
      animations: { enabled: false },
      parentHeightOffset: 0,
    },
    colors,
    series: series as ApexCharts.ApexOptions['series'],
    // 2px de separación entre segmentos/barras con el color de la superficie
    stroke: isBar
      ? { show: true, width: spec.stacked ? 2 : 0, colors: [surface] }
      : { curve: 'straight', width: 2 },
    markers: isBar ? undefined : { size: spec.categories.length <= 31 ? 3 : 0, strokeWidth: 2, strokeColors: surface, hover: { size: 6 } },
    plotOptions: {
      bar: {
        borderRadius: 4,
        borderRadiusApplication: 'end',
        columnWidth: dense ? '70%' : '55%',
        horizontal: false,
      },
    },
    fill: { opacity: spec.type === 'area' ? 0.15 : 1 },
    dataLabels: { enabled: false },
    grid: { borderColor: grid, strokeDashArray: 0, xaxis: { lines: { show: false } }, padding: { left: 8, right: 8 } },
    xaxis: {
      categories: spec.type === 'rangeBar' ? undefined : spec.categories,
      type: 'category',
      labels: { style: { colors: muted }, rotate: 0, hideOverlappingLabels: true, trim: false },
      tickAmount: dense || narrow ? (narrow ? 4 : 8) : undefined,
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
      labels: { style: { colors: muted }, formatter: (v: number) => fmt(spec.format, v).replace(/ \/(km|100 m)$/, '') },
    },
    legend: {
      show: spec.series.length > 1,
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
    const chart = new ApexCharts(el, options(spec));
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
