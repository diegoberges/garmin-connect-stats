/**
 * Familias de actividad: deciden qué métricas tienen sentido (ritmo, velocidad, distancia…).
 * Los typeKey vienen de Garmin (/activity-service/activity/activityTypes/simple).
 */
export type ActivityKind = 'foot' | 'cycling' | 'swim' | 'other';

export function kindOf(typeKey: string): ActivityKind {
  if (/swim/.test(typeKey)) return 'swim';
  if (/cycl|bik|ride|bmx|mtb/.test(typeKey)) return 'cycling';
  if (/run|walk|hik|rucking|mountaineering|canicross|snow_shoe/.test(typeKey)) return 'foot';
  return 'other';
}

/** Tiene sentido hablar de distancia (y de km por semana). */
export const hasDistance = (k: ActivityKind) => k !== 'other';

/** Ritmo o velocidad de una sesión en la unidad natural de su familia (undefined si no aplica). */
export function speedValue(k: ActivityKind, distanceKm: number, movingS: number): number | undefined {
  if (distanceKm <= 0.05 || movingS <= 0) return undefined;
  if (k === 'foot') return movingS / distanceKm; // s/km
  if (k === 'swim') return movingS / (distanceKm * 10); // s/100 m
  if (k === 'cycling') return distanceKm / (movingS / 3600); // km/h
  return undefined;
}

export const speedLabel = (k: ActivityKind) => (k === 'cycling' ? 'Velocidad media' : 'Ritmo medio');
export const speedUnit = (k: ActivityKind) => (k === 'cycling' ? 'km/h' : k === 'swim' ? '/100 m' : '/km');

/** Mapa topográfico (curvas de nivel) para deportes de montaña; callejero para el resto. */
export const mapStyleFor = (typeKey: string): 'topo' | 'street' =>
  /trail|hik|mountain|backcountry|snow_shoe|enduro_mtb|cyclocross|gravel|ski/.test(typeKey) ? 'topo' : 'street';
