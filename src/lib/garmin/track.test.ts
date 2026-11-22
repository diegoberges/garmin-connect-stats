/**
 * Procesado del FIT con la captura real de .data/raw (se salta si no existe: los datos son personales y
 * no están en el repositorio).
 */
import { existsSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { type ActivityTrack, GAP_BUCKET, parseActivityFile } from './track';

const FIT = '.data/raw/activity-fit.zip';

describe.skipIf(!existsSync(FIT))('FIT real', () => {
  // Se lee aquí y no en el cuerpo del describe: ese cuerpo se ejecuta aunque se salte (y en CI no hay captura)
  let track: ActivityTrack;
  beforeAll(() => {
    track = parseActivityFile(new Uint8Array(readFileSync(FIT)))!;
  });

  it('parciales por km con su distancia ajustada por pendiente', () => {
    const full = track.splits.filter((s) => s.distanceM >= 999);
    expect(full.length).toBeGreaterThan(0);
    for (const s of full) {
      expect(s.gapDistanceM).toBeDefined();
      // El ajuste por pendiente no cambia un km más de un 40 %
      expect(s.gapDistanceM! / s.distanceM).toBeGreaterThan(0.6);
      expect(s.gapDistanceM! / s.distanceM).toBeLessThan(1.4);
    }
    const sum = track.splits.reduce((a, s) => a + (s.gapDistanceM ?? 0), 0);
    expect(sum).toBeCloseTo(track.gapDistanceM!, -1);
  });

  it('tiempo por velocidad ajustada: cubre casi todo el tiempo activo', () => {
    const total = track.gapTimeBySpeed!.reduce((a, b) => a + b, 0);
    expect(total / track.activeS!).toBeGreaterThan(0.8);
    expect(total / track.activeS!).toBeLessThanOrEqual(1.001);
    expect(GAP_BUCKET).toBe(0.05);
  });

  it('VFC intra-sesión con los intervalos RR y respiración en las series', () => {
    expect(track.rr).toBeDefined();
    expect(track.rr!.count).toBeGreaterThan(1000);
    expect(track.rr!.rmssd).toBeGreaterThan(1);
    expect(track.rr!.rmssd).toBeLessThan(200);
    expect(track.series.some((p) => p.resp !== undefined)).toBe(true);
  });
});
