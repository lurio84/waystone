import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Location from 'expo-location';
import { AppState, PermissionsAndroid, Platform } from 'react-native';
import { syncAchievements } from '@/db/achievements';
import {
  addManualEvent,
  discardEmptyActiveRun,
  finishRun,
  getActiveRun,
  getLastPointTs,
  listAllRuns,
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
    notificationTitle: 'Waystone · grabando carrera',
    notificationBody: 'GPS activo. La grabación sigue con la pantalla apagada.',
    notificationColor: '#7D9B4E',
    killServiceOnDestroy: false,
  },
};

/** Si el último punto es más viejo que esto, la tarea se considera caída. */
const STALE_POINT_MS = 30_000;

const BATTERY_EXEMPTION_ASKED = 'waystone.batteryExemptionAsked';

/** Package id real en runtime — así el rename del proyecto no rompe el intent. */
const PACKAGE_ID =
  Constants.expoConfig?.android?.package ??
  (Constants as { platform?: { android?: { package?: string } } }).platform?.android?.package ??
  'com.lurio.waystone';

export type PermissionResult = 'granted' | 'foreground-only' | 'denied';

/**
 * Permiso de notificaciones (Android 13+). Best-effort: sin él, la notificación
 * del foreground service queda oculta, y un FGS `location` sin notificación
 * visible es más fácil de matar por el OEM → empeora el P0. No bloquea grabar.
 */
async function requestNotificationPermission(): Promise<void> {
  if (Platform.OS !== 'android' || Number(Platform.Version) < 33) return;
  try {
    await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  } catch {
    // si la ROM no lo soporta, seguimos: es una mejora, no un requisito
  }
}

/** Pide permiso de ubicación. El de background va DESPUÉS del normal, aparte. */
export async function requestPermissions(): Promise<PermissionResult> {
  // Antes de arrancar el FGS: en Android 13+ el permiso debe estar resuelto
  // para que su notificación sea visible.
  await requestNotificationPermission();
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

/**
 * Reengancha el tracking de forma INCONDICIONAL: para (si estaba) y arranca.
 * Solo llamar desde primer plano — es donde expo-location deja arrancar el
 * foreground service. `isTaskRunning()` no vale como guarda porque miente tras
 * un kill (el registro de la tarea se restaura de SharedPreferences).
 */
async function reattachUpdates(): Promise<void> {
  try {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  } catch {
    // no estaba corriendo
  }
  await startUpdates();
}

/** Empieza (o reanuda) la grabación. Se llama siempre desde primer plano. */
export async function startRecording(): Promise<number> {
  const runId = startRun();
  await reattachUpdates();
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
  // Persiste las runas que esta carrera haya desbloqueado. Best-effort: si
  // falla, la próxima carrera (o la pantalla de perfil al montar) reintenta.
  try {
    syncAchievements(listAllRuns());
  } catch {
    // no bloquear el cierre de la carrera por esto
  }
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
 * Watchdog. Reengancha las actualizaciones de ubicación si hay carrera activa
 * y el último punto es viejo.
 *
 * CRÍTICO: solo actúa con la app en PRIMER PLANO. En background, expo-location
 * se niega en silencio a arrancar el foreground service
 * (LocationTaskConsumer.kt: "Foreground location task cannot be started while
 * the app is in the background"). Un stop+start desde background destruye un
 * foreground service sano y lo deja como suscripción estrangulada — es decir,
 * el watchdog escrito para salvar la grabación es lo que la mataba. Además el
 * stop+start incondicional era daño gratis: si ya graba bien, no se toca.
 */
export async function ensureTracking(): Promise<boolean> {
  if (AppState.currentState !== 'active') return false;

  const active = getActiveRun();
  if (!active) return false;

  // Con 0 puntos el punto de referencia es el inicio de la carrera: si lleva
  // > STALE_POINT_MS sin recibir NI el primer fix, algo va mal y hay que
  // reenganchar (antes: null → nunca stale → una carrera sin fix no reenganchaba).
  const lastTs = getLastPointTs(active.id) ?? active.startedAt;
  const running = await isTaskRunning();
  const stale = Date.now() - lastTs > STALE_POINT_MS;

  if (running && !stale) return false;

  await reattachUpdates();
  return true;
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
  // Arranque en frío tras un kill: reenganche incondicional. La app está en
  // primer plano (el usuario acaba de abrirla).
  await reattachUpdates();
  return active.id;
}
