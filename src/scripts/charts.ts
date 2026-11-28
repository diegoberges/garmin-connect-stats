/**
 * Monta las gráficas declaradas con data-chart (JSON de ChartSpec) y las repinta al cambiar el tema
 * o el ancho. Las opciones de ApexCharts salen de chart-options.ts.
 *
 * Rendimiento: pintar una gráfica cuesta decenas de ms y algunas páginas tienen 9, así que no se pintan
 * todas de golpe en una sola tarea larga. Cada gráfica se pinta cuando se acerca a la pantalla y, entre
 * una y otra, se cede el hilo principal para que el navegador atienda clics y desplazamiento.
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
  coarse: matchMedia('(pointer: coarse)').matches,
});

/** Quita a un elemento de la leyenda su papel de botón (role, tabindex y la etiqueta de "pulsa para alternar"). */
function plainLegendItem(item: Element) {
  item.removeAttribute('role');
  item.removeAttribute('tabindex');
  item.removeAttribute('aria-label');
  item.removeAttribute('aria-pressed');
}

/** Gráficas ya pintadas. */
const charts = new Map<HTMLElement, ApexCharts>();
/** Cola de gráficas por pintar (o repintar), en orden. */
const pending = new Set<HTMLElement>();
let draining = false;

/** Cede el hilo principal: `scheduler.yield()` donde existe (no en Safari) y, si no, un `setTimeout`. */
function yieldToMain(): Promise<void> {
  const scheduler = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (scheduler?.yield) return scheduler.yield();
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function render(el: HTMLElement) {
  charts.get(el)?.destroy();
  const spec = JSON.parse(el.dataset.chart!) as ChartSpec;
  el.replaceChildren();
  const env = envFor(el);
  const chart = new ApexCharts(el, buildOptions(spec, env));
  // Con dedo la leyenda no alterna series: que no quede como un botón enfocable que no hace nada
  void chart.render().then(() => {
    if (env.coarse) for (const item of el.querySelectorAll('.apexcharts-legend-series')) plainLegendItem(item);
  });
  charts.set(el, chart);
}

/**
 * Pinta la cola durante 50 ms como mucho (el umbral de una tarea larga); si queda algo, cede el hilo
 * y sigue después desde donde lo dejó.
 */
function drainStep() {
  const deadline = performance.now() + 50;
  for (const el of pending) {
    pending.delete(el);
    render(el);
    if (pending.size && performance.now() >= deadline) {
      void yieldToMain().then(drainStep);
      return;
    }
  }
  draining = false;
}

function queue(el: HTMLElement) {
  pending.add(el);
  if (draining) return;
  draining = true;
  // En una microtarea: así entran antes en la cola todas las que llegan juntas (p. ej. las visibles al cargar)
  queueMicrotask(drainStep);
}

// Cada gráfica se pinta al acercarse a la pantalla (con margen para que ya esté al llegar)
const nearViewport = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      nearViewport.unobserve(entry.target);
      queue(entry.target as HTMLElement);
    }
  },
  { rootMargin: '400px 0px' },
);
for (const el of document.querySelectorAll<HTMLElement>('[data-chart]')) nearViewport.observe(el);

/** Al cambiar el tema o el ancho se repintan las ya pintadas; las demás saldrán bien al llegar. */
function repaintMounted() {
  for (const el of charts.keys()) queue(el);
}

let resizeTimer: ReturnType<typeof setTimeout> | undefined;
let lastWidth = window.innerWidth;
window.addEventListener('resize', () => {
  if (window.innerWidth === lastWidth) return;
  lastWidth = window.innerWidth;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(repaintMounted, 200);
});
// Re-pintar con los tokens del tema nuevo al alternar claro/oscuro
new MutationObserver(repaintMounted).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['class'],
});
