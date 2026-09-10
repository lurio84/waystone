import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * Lo último que el usuario ya ha VISTO de su progresión, para no repetir la
 * celebración. Separado de `settings` (preferencias) y de `session` (efímero):
 * esto es un marcador persistente de "ya te lo enseñé".
 */
interface ProgressSeenState {
  /** Nivel más alto para el que ya se mostró el pulso de subida. Todos empiezan en 1. */
  lastSeenLevel: number;
  markLevelSeen: (level: number) => void;
}

export const useProgressSeen = create<ProgressSeenState>()(
  persist(
    (set) => ({
      lastSeenLevel: 1,
      markLevelSeen: (lastSeenLevel) => set({ lastSeenLevel }),
    }),
    { name: 'waystone.progress', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
