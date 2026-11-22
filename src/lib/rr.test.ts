import { describe, expect, it } from 'vitest';
import { rrStats } from './rr';

describe('VFC intra-sesión (intervalos RR)', () => {
  it('RMSSD, SDNN y pNN50 de una serie alterna conocida', () => {
    // 0,50 / 0,56 s alternos: diferencias de ±60 ms → RMSSD 60, pNN50 100 %, media 530 ms
    const rr = Array.from({ length: 200 }, (_, i) => (i % 2 ? 0.56 : 0.5));
    const s = rrStats(rr)!;
    expect(s.count).toBe(200);
    expect(s.rmssd).toBeCloseTo(60, 5);
    expect(s.lnRmssd).toBeCloseTo(Math.log(60), 5);
    expect(s.pnn50).toBe(100);
    expect(s.meanRr).toBeCloseTo(530, 5);
    expect(s.sdnn).toBeCloseTo(30.08, 1);
    expect(s.artifactPct).toBe(0);
  });

  it('descarta artefactos: fuera de 0,3–2 s y saltos de más del 20 %', () => {
    const rr = Array.from({ length: 200 }, () => 0.5);
    rr[10] = 0.1; // imposible
    rr[20] = 2.5; // imposible
    rr[30] = 0.9; // salto del 80 %
    const s = rrStats(rr)!;
    expect(s.count).toBe(197);
    expect(s.rmssd).toBe(0);
    expect(s.artifactPct).toBeCloseTo(1.5, 5);
  });

  it('con pocos datos no da cifras', () => {
    expect(rrStats(Array(50).fill(0.5))).toBeUndefined();
  });
});
