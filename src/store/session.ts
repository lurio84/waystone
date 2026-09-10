import { create } from 'zustand';

import type { RuneUnlock } from '@/core/runes';

export type SessionStatus = 'idle' | 'recording' | 'paused';

interface SessionState {
  runId: number | null;
  status: SessionStatus;
  /** epoch ms en que arrancó la carrera, para el cronómetro de pantalla */
  startedAt: number | null;
  /**
   * Runas desbloqueadas por la carrera que se acaba de cerrar, a la espera de
   * que la pantalla de detalle las anuncie. `stopRecording` las deja aquí;
   * la pantalla las vacía al montar. NO se limpian en `end()`, que corre
   * antes de navegar al detalle.
   */
  pendingUnlocks: RuneUnlock[];
  begin: (runId: number, startedAt: number, status?: SessionStatus) => void;
  pause: () => void;
  resume: () => void;
  end: () => void;
  setPendingUnlocks: (unlocks: RuneUnlock[]) => void;
  drainPendingUnlocks: () => RuneUnlock[];
}

/**
 * Estado EFÍMERO de la sesión de carrera en curso. La verdad está en SQLite;
 * esto es solo lo que la UI necesita a mano. Se reconstruye al arrancar la
 * app leyendo la carrera activa.
 */
export const useSession = create<SessionState>((set, get) => ({
  runId: null,
  status: 'idle',
  startedAt: null,
  pendingUnlocks: [],
  begin: (runId, startedAt, status = 'recording') => set({ runId, startedAt, status }),
  pause: () => set({ status: 'paused' }),
  resume: () => set({ status: 'recording' }),
  end: () => set({ runId: null, startedAt: null, status: 'idle' }),
  setPendingUnlocks: (pendingUnlocks) => set({ pendingUnlocks }),
  drainPendingUnlocks: () => {
    const unlocks = get().pendingUnlocks;
    if (unlocks.length > 0) set({ pendingUnlocks: [] });
    return unlocks;
  },
}));
