/**
 * Edad física de Garmin con sus palancas de mejora. Garmin la calcula a partir de VO2máx,
 * días y minutos vigorosos, FC en reposo e IMC/% de grasa; la fórmula no es pública.
 * Las claves de `components` no están enumeradas en la spec: se etiquetan las conocidas y el resto se humaniza.
 */
import { unwrap, type GarminClient } from './client';
import { isoDate } from '../dates';
import type { ApiJson } from './types';

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

type ApiFitnessAge = Extract<ApiJson<'/fitnessage-service/fitnessage/v2/{calendarDate}'>, unknown[]>[number];

/** La spec dice lista, pero la API real devuelve un objeto suelto: se aceptan ambas formas. */
export function pickFitnessAge(res: unknown): ApiFitnessAge | undefined {
  const f = Array.isArray(res) ? res.at(-1) : res;
  return f && typeof f === 'object' ? (f as ApiFitnessAge) : undefined;
}

export interface FitnessLever {
  key: string;
  label: string;
  value?: number;
  target?: number;
  /** edad física que tendrías alcanzando el objetivo de esta palanca */
  potentialAge?: number;
  priority?: number;
  stale: boolean;
}

export interface FitnessAge {
  age?: number;
  fitnessAge?: number;
  achievable?: number;
  previous?: number;
  levers: FitnessLever[];
}

const LABELS: Record<string, string> = {
  vigorousDaysAvg: 'Días vigorosos por semana',
  vigorousDays: 'Días vigorosos por semana',
  vigorousMinutesAvg: 'Minutos vigorosos por semana',
  vigorousMinutes: 'Minutos vigorosos por semana',
  rhr: 'FC en reposo',
  restingHeartRate: 'FC en reposo',
  bmi: 'IMC',
  bodyFat: '% de grasa corporal',
  vo2Max: 'VO2máx',
};
const humanize = (k: string) => {
  const t = k
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replaceAll('_', ' ')
    .toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export async function getFitnessAge(client: GarminClient): Promise<FitnessAge | undefined> {
  const f = pickFitnessAge(
    await unwrap(
      client.GET('/fitnessage-service/fitnessage/v2/{calendarDate}', { params: { path: { calendarDate: isoDate() } } }),
    ),
  );
  if (!f || f.invalidReason) return undefined;
  const levers = Object.entries(f.components ?? {})
    .map(([key, c]) => ({
      key,
      label: LABELS[key] ?? humanize(key),
      value: num(c?.value),
      target: num(c?.targetValue),
      potentialAge: num(c?.potentialAge),
      priority: num(c?.priority),
      stale: Boolean(c?.stale),
    }))
    .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
  return {
    age: num(f.chronologicalAge),
    fitnessAge: num(f.fitnessAge),
    achievable: num(f.achievableFitnessAge),
    previous: num(f.previousFitnessAge),
    levers,
  };
}
