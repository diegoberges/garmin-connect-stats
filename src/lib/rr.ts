/**
 * VFC intra-sesión a partir de los intervalos RR del FIT (mensajes `hrv`, solo si el reloj o la banda
 * los graban). Limpieza básica de artefactos: se quitan RR fuera de 0,3–2 s y los que cambian más de un
 * 20 % respecto al anterior válido. Durante el ejercicio la VFC cae mucho: sirve para comparar sesiones
 * parecidas entre sí, no con la VFC nocturna.
 */
export interface RrStats {
  /** RR válidos usados */
  count: number;
  /** % descartado por artefactos */
  artifactPct: number;
  /** ms */
  rmssd: number;
  lnRmssd: number;
  /** ms */
  sdnn: number;
  /** % de diferencias sucesivas > 50 ms */
  pnn50: number;
  /** ms */
  meanRr: number;
}

const MIN_RR = 0.3;
const MAX_RR = 2;
const MAX_JUMP = 0.2;
/** Mínimo de RR válidos para dar cifras (unos 2–3 min de datos). */
const MIN_COUNT = 120;

/** RR en segundos (como vienen en el FIT) → estadísticas en ms, o undefined si hay pocos datos. */
export function rrStats(rrSeconds: number[]): RrStats | undefined {
  const clean: number[] = []; // en ms
  let prev: number | undefined; // último RR válido, en s
  for (const rr of rrSeconds) {
    if (!(rr >= MIN_RR && rr <= MAX_RR)) continue;
    if (prev !== undefined && Math.abs(rr - prev) / prev > MAX_JUMP) continue;
    prev = rr;
    clean.push(rr * 1000);
  }
  if (clean.length < MIN_COUNT) return undefined;
  const diffs = clean.slice(1).map((v, i) => v - clean[i]);
  const rmssd = Math.sqrt(diffs.reduce((a, d) => a + d * d, 0) / diffs.length);
  const meanRr = clean.reduce((a, b) => a + b, 0) / clean.length;
  const sdnn = Math.sqrt(clean.reduce((a, v) => a + (v - meanRr) ** 2, 0) / (clean.length - 1));
  return {
    count: clean.length,
    artifactPct: (1 - clean.length / rrSeconds.length) * 100,
    rmssd,
    lnRmssd: Math.log(rmssd),
    sdnn,
    pnn50: (diffs.filter((d) => Math.abs(d) > 50).length / diffs.length) * 100,
    meanRr,
  };
}
