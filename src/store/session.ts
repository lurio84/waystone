import { create } from 'zustand';

export type SessionStatus = 'idle' | 'recording' | 'paused';

interface SessionState {
  runId: number | null;
  status: SessionStatus;
  /** epoch ms en que arrancó la carrera, para el cronómetro de pantalla */
  startedAt: number | null;
  begin: (runId: number, startedAt: number) => void;
  pause: () => void;
  resume: () => void;
  end: () => void;
}

/**
 * Estado EFÍMERO de la sesión de carrera en curso. La verdad está en SQLite;
 * esto es solo lo que la UI necesita a mano. Se reconstruye al arrancar la
 * app leyendo la carrera activa.
 */
export const useSession = create<SessionState>((set) => ({
  runId: null,
  status: 'idle',
  startedAt: null,
  begin: (runId, startedAt) => set({ runId, startedAt, status: 'recording' }),
  pause: () => set({ status: 'paused' }),
  resume: () => set({ status: 'recording' }),
  end: () => set({ runId: null, startedAt: null, status: 'idle' }),
}));
