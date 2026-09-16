/** Formateadores para la UI. Puro, sin dependencias. */

/** 3725 → "1:02:05"; 305 → "5:05". */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`;
}

/** 333 s/km → "5:33". 0 o no finito → "--:--". */
export function formatPace(secondsPerKm: number): string {
  if (!Number.isFinite(secondsPerKm) || secondsPerKm <= 0) return '--:--';
  const m = Math.floor(secondsPerKm / 60);
  const s = Math.round(secondsPerKm % 60);
  const mm = s === 60 ? m + 1 : m;
  const ss = s === 60 ? 0 : s;
  return `${mm}:${String(ss).padStart(2, '0')}`;
}

/** 2410 → "2,41". */
export function formatKm(meters: number): string {
  return (meters / 1000).toFixed(2).replace('.', ',');
}

/** epoch ms → "9 sep 2026, 18:40" (es-ES). */
export function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
