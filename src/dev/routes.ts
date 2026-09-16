import { haversineMeters } from '@/core/geo';

/**
 * Rutas sintéticas para el simulador (`src/dev/simulator.ts`). Coordenadas
 * aproximadas de Sevilla. Solo se cargan en desarrollo / modo demo.
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

// --- Parque de María Luisa + Avenida de la Palmera: bucle ~3 km ---
const parkLoop: RouteScenario = {
  id: 'park-loop',
  name: 'María Luisa y la Palmera',
  description: 'Bucle ~3 km, ritmo cómodo, un semáforo de 40 s a mitad.',
  paceSPerKm: 330, // 5:30 /km
  jitterM: 3,
  waypoints: [
    { lat: 37.3776, lon: -5.9868 }, // Plaza de España
    { lat: 37.3742, lon: -5.9876 },
    { lat: 37.3705, lon: -5.9884 },
    { lat: 37.3668, lon: -5.9892 }, // baja por la Palmera
    { lat: 37.3654, lon: -5.9863 },
    { lat: 37.3689, lon: -5.9847 },
    { lat: 37.3726, lon: -5.9846 },
    { lat: 37.3763, lon: -5.9850 }, // sube de vuelta
    { lat: 37.3781, lon: -5.9861 },
    { lat: 37.3776, lon: -5.9868 }, // cierra el bucle
  ],
  events: [{ atM: 1500, kind: 'stop', seconds: 40 }],
};

// --- Río Guadalquivir: ida y vuelta ~5 km ---
const riverRun: RouteScenario = {
  id: 'river-run',
  name: 'Río — Torre del Oro a la Barqueta',
  description: 'Ida y vuelta ~5 km por el río. Túnel bajo un puente y un pico de imprecisión.',
  paceSPerKm: 300, // 5:00 /km
  jitterM: 4,
  waypoints: [
    { lat: 37.3823, lon: -5.9963 }, // Torre del Oro
    { lat: 37.3868, lon: -5.9971 },
    { lat: 37.3912, lon: -5.9979 }, // Puente de Triana
    { lat: 37.3968, lon: -5.9985 },
    { lat: 37.4032, lon: -5.9992 }, // Puente de la Barqueta
    { lat: 37.3968, lon: -5.9985 }, // vuelta
    { lat: 37.3912, lon: -5.9979 },
    { lat: 37.3868, lon: -5.9971 },
    { lat: 37.3823, lon: -5.9963 },
  ],
  events: [
    { atM: 1000, kind: 'gap', seconds: 25 }, // bajo el Puente de Triana
    { atM: 2800, kind: 'accuracy', accuracyM: 40, seconds: 30 },
  ],
};

// --- Ruta corta para iterar rápido ~800 m ---
const quickTest: RouteScenario = {
  id: 'quick',
  name: 'Prueba rápida (~800 m)',
  description: 'Corta, para probar cambios deprisa. Sin eventos.',
  paceSPerKm: 300,
  jitterM: 2,
  waypoints: [
    { lat: 37.3776, lon: -5.9868 },
    { lat: 37.3742, lon: -5.9876 },
    { lat: 37.3735, lon: -5.9845 },
    { lat: 37.3769, lon: -5.9838 },
  ],
  events: [],
};

export const ROUTES: RouteScenario[] = [parkLoop, riverRun, quickTest];
