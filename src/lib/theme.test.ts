import { describe, expect, it } from 'vitest';
import { metaContent, nextStored, parseStored, resolvedScheme } from './theme';

describe('tema', () => {
  it('solo acepta light o dark como valor guardado', () => {
    expect(parseStored('dark')).toBe('dark');
    expect(parseStored('light')).toBe('light');
    expect(parseStored(null)).toBeNull();
    expect(parseStored('azul')).toBeNull();
  });

  it('el meta sigue al sistema si no hay nada guardado', () => {
    expect(metaContent(null)).toBe('light dark');
    expect(metaContent('dark')).toBe('dark');
  });

  it('lo guardado manda sobre el sistema', () => {
    expect(resolvedScheme(null, true)).toBe('dark');
    expect(resolvedScheme(null, false)).toBe('light');
    expect(resolvedScheme('light', true)).toBe('light');
  });

  it('el botón guarda el contrario si difiere del sistema y lo borra si coincide', () => {
    // Sistema claro: pasar a oscuro se guarda; volver a claro borra la preferencia
    expect(nextStored('light', false)).toBe('dark');
    expect(nextStored('dark', false)).toBeNull();
    // Sistema oscuro con oscuro fijado (el sistema cambió después): pasar a claro se guarda
    expect(nextStored('dark', true)).toBe('light');
    expect(nextStored('light', true)).toBeNull();
  });
});
