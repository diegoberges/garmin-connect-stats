/**
 * Percentil de VO2máx por sexo y edad con las tablas FRIEND de cinta (VO2máx medido por CPX):
 * Kaminsky LA, Arena R, Myers J. Mayo Clin Proc. 2015;90(11):1515–1523, tabla 3 (PMC4919021).
 * Las tablas actualizadas de 2022 (no abiertas) son 1,5–4,6 ml/kg/min más bajas: con estas el percentil
 * sale algo conservador. El VO2máx del reloj es una estimación (±5 %), así que el percentil es orientativo.
 */
export type Sex = 'male' | 'female';

const PCTS = [5, 10, 25, 50, 75, 90, 95] as const;
const AGE_GROUPS = [20, 30, 40, 50, 60, 70] as const; // 20–29 … 70–79

const TABLE: Record<Sex, number[][]> = {
  male: [
    [29.0, 32.1, 40.1, 48.0, 55.2, 61.8, 66.3],
    [27.2, 30.2, 35.9, 42.4, 49.2, 56.5, 59.8],
    [24.2, 26.8, 31.9, 37.8, 45.0, 52.1, 55.6],
    [20.9, 22.8, 27.1, 32.6, 39.7, 45.6, 50.7],
    [17.4, 19.8, 23.7, 28.2, 34.5, 40.3, 43.0],
    [16.3, 17.1, 20.4, 24.4, 30.4, 36.6, 39.7],
  ],
  female: [
    [21.7, 23.9, 30.5, 37.6, 44.7, 51.3, 56.0],
    [19.0, 20.9, 25.3, 30.2, 36.1, 41.4, 45.8],
    [17.0, 18.8, 22.1, 26.7, 32.4, 38.4, 41.7],
    [16.0, 17.3, 19.9, 23.4, 27.6, 32.0, 35.9],
    [13.4, 14.6, 17.2, 20.0, 23.8, 27.0, 29.4],
    [13.1, 13.6, 15.6, 18.3, 20.8, 23.1, 24.1],
  ],
};

export interface Vo2Percentile {
  /** percentil interpolado (5–95); fuera de tabla se acota y se marca con `bound` */
  percentile: number;
  bound?: 'below' | 'above';
  /** grupo de edad usado, p. ej. "30–39" */
  group: string;
  /** referencias del grupo para dibujar la escala */
  marks: { p: number; value: number }[];
}

export function vo2Percentile(value: number, age: number, sex: Sex): Vo2Percentile {
  const gi = Math.min(AGE_GROUPS.length - 1, Math.max(0, Math.floor((age - 20) / 10)));
  const row = TABLE[sex][gi];
  const group = `${AGE_GROUPS[gi]}–${AGE_GROUPS[gi] + 9}`;
  const marks = PCTS.map((p, i) => ({ p, value: row[i] }));
  if (value < row[0]) return { percentile: 5, bound: 'below', group, marks };
  if (value >= row.at(-1)!) return { percentile: 95, bound: 'above', group, marks };
  const i = row.findIndex((v, k) => value >= v && value < row[k + 1]);
  const f = (value - row[i]) / (row[i + 1] - row[i]);
  return { percentile: Math.round(PCTS[i] + f * (PCTS[i + 1] - PCTS[i])), group, marks };
}
