/**
 * Botón de tema y sincronización: mantiene `<meta name="color-scheme">` (del que sale `color-scheme` en
 * CSS para los controles nativos) y la clase `.dark` (de la que dependen Tailwind, Flowbite y las gráficas).
 */
import { metaContent, nextStored, parseStored, resolvedScheme, type Scheme, THEME_KEY } from '../lib/theme';

const meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
const systemDark = matchMedia('(prefers-color-scheme: dark)');

function readStored(): Scheme | null {
  try {
    return parseStored(localStorage.getItem(THEME_KEY));
  } catch {
    return null; // datos del sitio bloqueados: se sigue al sistema
  }
}

function writeStored(stored: Scheme | null) {
  try {
    if (stored) localStorage.setItem(THEME_KEY, stored);
    else localStorage.removeItem(THEME_KEY);
  } catch {
    // Sin almacenamiento el tema se aplica igual, solo que no se recuerda
  }
}

function apply(stored: Scheme | null) {
  if (meta) meta.content = metaContent(stored);
  const dark = resolvedScheme(stored, systemDark.matches) === 'dark';
  if (document.documentElement.classList.contains('dark') !== dark) {
    document.documentElement.classList.toggle('dark', dark);
  }
}

document.getElementById('theme-toggle')?.addEventListener('click', () => {
  const rendered: Scheme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  const stored = nextStored(rendered, systemDark.matches);
  writeStored(stored);
  apply(stored);
});

// El sistema puede cambiar de tema en cualquier momento (p. ej. según la hora)
systemDark.addEventListener('change', () => apply(readStored()));
// Otra pestaña ha cambiado el tema
window.addEventListener('storage', (e) => {
  if (e.key === THEME_KEY || e.key === null) apply(readStored());
});
