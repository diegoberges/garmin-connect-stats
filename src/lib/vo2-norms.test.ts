import { describe, expect, it } from 'vitest';
import { vo2Percentile } from './vo2-norms';

describe('vo2Percentile (FRIEND 2015)', () => {
  it('mediana exacta del grupo', () => {
    expect(vo2Percentile(42.4, 35, 'male').percentile).toBe(50);
    expect(vo2Percentile(30.2, 35, 'female').percentile).toBe(50);
  });
  it('interpola entre percentiles', () => {
    // hombre 30–39: P75 49,2 · P90 56,5 → 52,85 queda a mitad (≈ P83)
    expect(vo2Percentile(52.85, 38, 'male').percentile).toBe(83);
  });
  it('acota fuera de la tabla y por edad', () => {
    expect(vo2Percentile(70, 25, 'male')).toMatchObject({ percentile: 95, bound: 'above' });
    expect(vo2Percentile(10, 25, 'female')).toMatchObject({ percentile: 5, bound: 'below' });
    expect(vo2Percentile(30, 85, 'male').group).toBe('70–79');
  });
});
