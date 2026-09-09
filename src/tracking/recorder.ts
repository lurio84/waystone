import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Location from 'expo-location';
import { Platform } from 'react-native';
import {
  addManualEvent,
  discardEmptyActiveRun,
  finishRun,
  getActiveRun,
  getLastPointTs,
  startRun,
} from '@/db/runs';
import { LOCATION_TASK } from './locationTask';

const LOCATION_OPTIONS: Location.LocationTaskOptions = {
  accuracy: Location.Accuracy.BestForNavigation,
  timeInterval: 1000,
  distanceInterval: 0,
  deferredUpdatesInterval: 0,
  pausesUpdatesAutomatically: false,
  activityType: Location.ActivityType.Fitness,
  showsBackgroundLocationIndicator: true,
  foregroundService: {
    notificationTitle: 'Zancada · grabando carrera',
    notificationBody: 'GPS activo. La grabación sigue con la pantalla apagada.',
    notificationColor: '#208AEF',
    killServiceOnDestroy: false,
  },
};

/** Si el último punto es más viejo que esto, la tarea se considera caída. */
const STALE_POINT_MS = 30_000;

const BATTERY_EXEMPTION_ASKED = 'zancada.batteryExemptionAsked';

/** Package id real en runtime — así el rename del proyecto no rompe el intent. */
const PACKAGE_ID =
  Constants.expoConfig?.android?.package ??
  (Constants as { platform?: { android?: { package?: string } } }).platform?.android?.package ??
  'com.lurio.zancada';

export type PermissionResult = 'granted' | 'foreground-only' | 'denied';

/** Pide permiso de ubicación. El de background va DESPUÉS del normal, aparte. */
export async function requestPermissions(): Promise<PermissionResult> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (!fg.granted) return 'denied';
  const bg = await Location.requestBackgroundPermissionsAsync();
  return bg.granted ? 'granted' : 'foreground-only';
}

/**
 * Pide (una sola vez) la exención de optimización de batería. En móviles con
 * MediaTek / capas OEM agresivas (CMF, Nothing, Xiaomi…) es lo que más corta
 * carreras largas: sin esto el sistema mata el foreground service tras unos
 * minutos con la pantalla apagada.
 */
export async function requestBatteryExemptionOnce(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    const asked = await AsyncStorage.getItem(BATTERY_EXEMPTION_ASKED);
    if (asked) return;
    await AsyncStorage.setItem(BATTERY_EXEMPTION_ASKED, '1');
    await IntentLauncher.startActivityAsync(
      'android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
      { data: `package:${PACKAGE_ID}` },
    );
  } catch {
    // si el intent no existe en esta ROM, no pasa nada: es una mejora, no un requisito
  }
}

async function isTaskRunning(): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
  } catch {
    return false;
  }
}

async function startUpdates(): Promise<void> {
  await Location.startLocationUpdatesAsync(LOCATION_TASK, LOCATION_OPTIONS);
}

/** Empieza (o reanuda) la grabación. Devuelve el id de la carrera. */
export async function startRecording(): Promise<number> {
  const runId = startRun();
  if (!(await isTaskRunning())) {
    await startUpdates();
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
 * Watchdog. Si hay carrera activa y (la tarea no corre, o el último punto es
 * viejo), relanza las actualizaciones de ubicación. Se llama al volver la app
 * a primer plano y en un intervalo mientras la pantalla de carrera está viva.
 * Devuelve true si tuvo que reengancharse.
 */
export async function ensureTracking(): Promise<boolean> {
  const active = getActiveRun();
  if (!active) return false;

  const running = await isTaskRunning();
  const lastTs = getLastPointTs(active.id);
  const stale = lastTs != null && Date.now() - lastTs > STALE_POINT_MS;

  if (!running || stale) {
    if (running) {
      try {
        await Location.stopLocationUpdatesAsync(LOCATION_TASK);
      } catch {
        // ignorar
      }
    }
    await startUpdates();
    return true;
  }
  return false;
}

/**
 * Solo en el ARRANQUE EN FRÍO de la app: limpia una carrera abandonada (app
 * matada antes de recibir ni un punto, o tras > grace sin fixes) y reengancha
 * el tracking si quedó una carrera activa de verdad.
 *
 * NO llamar en cada vuelta a primer plano: `discardEmptyActiveRun` sobre una
 * carrera recién empezada (0 puntos durante los primeros segundos) la borra.
 * Para el foreground, usar `ensureTracking()` a secas.
 */
export async function recoverActiveRun(): Promise<number | null> {
  discardEmptyActiveRun();
  const active = getActiveRun();
  if (!active) return null;
  await ensureTracking();
  return active.id;
}
