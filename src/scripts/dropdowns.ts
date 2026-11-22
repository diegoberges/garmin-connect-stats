/**
 * Completa la accesibilidad de los desplegables de Flowbite, que no la gestiona:
 *  - `aria-controls` y `aria-expanded` en cada botón, sincronizados con el panel;
 *  - Escape cierra el desplegable abierto y, si el foco estaba dentro, lo devuelve a su botón.
 */
interface FlowbiteDropdown {
  isVisible(): boolean;
  hide(): void;
}
interface FlowbiteRegistry {
  getInstances(component: 'Dropdown'): Record<string, FlowbiteDropdown> | undefined;
}

for (const trigger of document.querySelectorAll<HTMLElement>('[data-dropdown-toggle]')) {
  const panel = document.getElementById(trigger.dataset.dropdownToggle ?? '');
  if (!panel) continue;
  trigger.setAttribute('aria-controls', panel.id);
  // Flowbite muestra y oculta el panel con la clase `hidden`
  const sync = () => trigger.setAttribute('aria-expanded', String(!panel.classList.contains('hidden')));
  sync();
  new MutationObserver(sync).observe(panel, { attributes: true, attributeFilter: ['class'] });
}

document.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Escape') return;
  const registry = (globalThis as { FlowbiteInstances?: FlowbiteRegistry }).FlowbiteInstances;
  for (const [id, dropdown] of Object.entries(registry?.getInstances('Dropdown') ?? {})) {
    if (!dropdown.isVisible()) continue;
    const panel = document.getElementById(id);
    const hadFocus = panel?.contains(document.activeElement) ?? false;
    dropdown.hide();
    if (hadFocus) document.querySelector<HTMLElement>(`[aria-controls="${id}"]`)?.focus();
  }
});
