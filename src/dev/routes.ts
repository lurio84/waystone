import { haversineMeters } from '@/core/geo';

/**
 * Rutas sintéticas para el simulador (`src/dev/simulator.ts`). Coordenadas
 * reales de Sevilla. Solo se cargan en desarrollo / modo demo.
 */

export interface Waypoint {
  lat: number;
  lon: number;
}

export type RouteEvent =
  /** Pararse `seconds` al alcanzar `atM` metros (semáforo). */
  | { atM: number; kind: 'stop'; seconds: number }
  /** `seconds` sin emitir puntos desde `atM` (túnel, bajo un puente). */
  | { atM: number; kind: 'gap'; seconds: number }
  /** Precisión degradada a `accuracyM` durante `seconds` desde `atM`. */
  | { atM: number; kind: 'accuracy'; accuracyM: number; seconds: number };

export interface RouteScenario {
  id: string;
  name: string;
  description: string;
  waypoints: Waypoint[];
  /** ritmo objetivo en segundos por km */
  paceSPerKm: number;
  /** amplitud de deriva de GPS por punto (m) */
  jitterM: number;
  events: RouteEvent[];
}

/** Longitud real de una ruta (suma de tramos entre waypoints), en metros. */
export function routeLengthMeters(r: RouteScenario): number {
  let d = 0;
  for (let i = 1; i < r.waypoints.length; i++) {
    d += haversineMeters(r.waypoints[i - 1], r.waypoints[i]);
  }
  return d;
}

// --- Parque de María Luisa: bucle ~2,7 km ---
const parkLoop: RouteScenario = {
  id: 'park-loop',
  name: 'Parque de María Luisa',
  description: 'Bucle ~2,7 km, ritmo cómodo, un semáforo de 40 s a mitad.',
  paceSPerKm: 330, // 5:30 /km
  jitterM: 3,
  waypoints: [
    { lat: 37.37752, lon: -5.98693 }, // Plaza de España
    { lat: 37.37606, lon: -5.98842 },
    { lat: 37.37464, lon: -5.98795 },
    { lat: 37.37409, lon: -5.98965 }, // Glorieta sur
    { lat: 37.37512, lon: -5.99087 },
    { lat: 37.37665, lon: -5.99012 },
    { lat: 37.37772, lon: -5.98878 },
    { lat: 37.37806, lon: -5.98717 },
    { lat: 37.37752, lon: -5.98693 }, // cierra el bucle
  ],
  events: [{ atM: 1300, kind: 'stop', seconds: 40 }],
};

// --- Río Guadalquivir: ida y vuelta ~5 km ---
const riverRun: RouteScenario = {
  id: 'river-run',
  name: 'Río — Torre del Oro',
  description: 'Ida y vuelta ~5 km por el río. Túnel bajo un puente y un pico de imprecisión.',
  paceSPerKm: 300, // 5:00 /km
  jitterM: 4,
  waypoints: [
    { lat: 37.38227, lon: -5.99633 }, // Torre del Oro
    { lat: 37.38556, lon: -5.99686 },
    { lat: 37.38921, lon: -5.99725 }, // Puente de Triana
    { lat: 37.39264, lon: -5.99804 },
    { lat: 37.39643, lon: -6.00019 },
    { lat: 37.39264, lon: -5.99804 }, // vuelta
    { lat: 37.38921, lon: -5.99725 },
    { lat: 37.38556, lon: -5.99686 },
    { lat: 37.38227, lon: -5.99633 },
  ],
  events: [
    { atM: 900, kind: 'gap', seconds: 25 }, // bajo el Puente de Triana
    { atM: 2600, kind: 'accuracy', accuracyM: 40, seconds: 30 },
  ],
};

// --- Ruta corta para iterar rápido ---
const quickTest: RouteScenario = {
  id: 'quick',
  name: 'Test rápido (~450 m)',
  description: 'Corta, para probar cambios deprisa. Sin eventos.',
  paceSPerKm: 300,
  jitterM: 2,
  waypoints: [
    { lat: 37.3775, lon: -5.9869 },
    { lat: 37.3773, lon: -5.9889 },
    { lat: 37.3763, lon: -5.9890 },
    { lat: 37.3762, lon: -5.9870 },
  ],
  events: [],
};

export const ROUTES: RouteScenario[] = [parkLoop, riverRun, quickTest];
