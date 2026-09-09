import * as Location from 'expo-location';
import {
  addManualEvent,
  discardEmptyActiveRun,
  finishRun,
  getActiveRun,
  startRun,
} from '@/db/runs';
import { LOCATION_TASK } from './locationTask';

const LOCATION_OPTIONS: Location.LocationTaskOptions = {
  accuracy: Location.Accuracy.BestForNavigation,
  timeInterval: 1000,
  distanceInterval: 0,
  pausesUpdatesAutomatically: false,
  activityType: Location.ActivityType.Fitness,
  showsBackgroundLocationIndicator: true,
  foregroundService: {
    notificationTitle: 'Zancada — grabando',
    notificationBody: 'Grabando tu carrera. Toca para volver.',
    notificationColor: '#208AEF',
  },
};

export type PermissionResult = 'granted' | 'foreground-only' | 'denied';

/** Pide permiso de ubicación. El de background va DESPUÉS del normal, aparte. */
export async function requestPermissions(): Promise<PermissionResult> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (!fg.granted) return 'denied';
  const bg = await Location.requestBackgroundPermissionsAsync();
  return bg.granted ? 'granted' : 'foreground-only';
}

async function isTaskRunning(): Promise<boolean> {
  return Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
}

/** Empieza (o reanuda) la grabación. Devuelve el id de la carrera. */
export async function startRecording(): Promise<number> {
  const runId = startRun();
  if (!(await isTaskRunning())) {
    await Location.startLocationUpdatesAsync(LOCATION_TASK, LOCATION_OPTIONS);
  }
  return runId;
}

/** Termina la grabación y cachea las métricas de la carrera. */
export async function stopRecording(): Promise<number | null> {
  const active = getActiveRun();
  if (await isTaskRunning()) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  }
  if (!active) return null;
  finishRun(active.id);
  return active.id;
}

/** Pausa manual: se registra como evento; el GPS sigue grabando la ruta. */
export function pause(): void {
  const a = getActiveRun();
  if (a) addManualEvent(a.id, 'pause');
}

export function resume(): void {
  const a = getActiveRun();
  if (a) addManualEvent(a.id, 'resume');
}

/**
 * Al arrancar la app: si quedó una carrera activa pero el foreground service
 * no está vivo (Android lo mató, o el bug conocido de expo-location tras una
 * actualización), relanzarlo para seguir añadiendo puntos a ESA carrera.
 * Si la carrera activa no tiene ni un punto, se descarta (start accidental).
 */
export async function recoverActiveRun(): Promise<number | null> {
  discardEmptyActiveRun();
  const active = getActiveRun();
  if (!active) return null;
  if (!(await isTaskRunning())) {
    await Location.startLocationUpdatesAsync(LOCATION_TASK, LOCATION_OPTIONS);
  }
  return active.id;
}
