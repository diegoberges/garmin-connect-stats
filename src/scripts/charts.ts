/**
 * Monta las gráficas declaradas con data-chart (JSON de ChartSpec) y las repinta al cambiar el tema
 * o el ancho. Las opciones de ApexCharts salen de chart-options.ts.
 */
import ApexCharts from 'apexcharts';
import type { ChartSpec } from '../lib/chart-spec';
import { buildOptions, type ChartEnv } from './chart-options';

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const envFor = (el: HTMLElement): ChartEnv => ({
  css,
  width: el.clientWidth || window.innerWidth,
  viewportWidth: window.innerWidth,
  dark: document.documentElement.classList.contains('dark'),
});

const charts = new Map<HTMLElement, ApexCharts>();

function renderAll() {
  for (const el of document.querySelectorAll<HTMLElement>('[data-chart]')) {
    charts.get(el)?.destroy();
    const spec = JSON.parse(el.dataset.chart!) as ChartSpec;
    el.innerHTML = '';
    const chart = new ApexCharts(el, buildOptions(spec, envFor(el)));
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
