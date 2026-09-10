/**
 * Tipos del núcleo de cálculo. Cero dependencias de React Native / Expo:
 * todo lo de esta carpeta es lógica pura y testeable en Node.
 */

/** Punto crudo tal cual lo entrega el GPS y lo guarda la capa de captura. */
export interface RawPoint {
  /** epoch en milisegundos */
  ts: number;
  lat: number;
  lon: number;
  /** metros sobre el nivel del mar, o null si el dispositivo no lo da */
  altitude: number | null;
  /** radio de precisión horizontal en metros, o null */
  accuracy: number | null;
  /** velocidad instantánea en m/s que reporta el GPS, o null */
  speed: number | null;
}

/** Pausa/reanudación que pulsó el usuario. Es un hecho, se persiste. */
export interface RunEvent {
  ts: number;
  kind: 'pause' | 'resume';
}

/** Intervalo temporal cerrado [start, end] en epoch ms. */
export interface Interval {
  start: number;
  end: number;
}

export interface Split {
  /** 0 = primer kilómetro */
  kmIndex: number;
  /** metros de este tramo (el último puede ser < 1000) */
  distanceM: number;
  durationS: number;
  paceSPerKm: number;
  elevGainM: number;
}

export interface RunMetrics {
  distanceM: number;
  movingTimeS: number;
  elapsedTimeS: number;
  avgPaceSPerKm: number;
  elevGainM: number;
}

/**
 * Lo que la progresión (XP, niveles, rachas, runas) necesita de una carrera
 * ya terminada. La capa de datos mapea `RunRow → RunSummary`; `src/core` no
 * conoce Drizzle. `id` es el de la fila `runs` — las runas lo persisten.
 */
export interface RunSummary {
  id: number;
  /** epoch ms del inicio */
  startedAt: number;
  distanceM: number;
  movingTimeS: number;
  elevGainM: number;
}
