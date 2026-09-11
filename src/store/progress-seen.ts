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
  /** true en cuanto AsyncStorage terminó de rehidratar. Antes de eso,
   *  `lastSeenLevel` vale el default (1) aunque ya hubiera un valor mayor
   *  persistido — sin este flag, el efecto de Perfil que compara contra
   *  `lastSeenLevel` dispara el pulso en falso en cada arranque en frío. */
  hasHydrated: boolean;
}

export const useProgressSeen = create<ProgressSeenState>()(
  persist(
    (set) => ({
      lastSeenLevel: 1,
      markLevelSeen: (lastSeenLevel) => set({ lastSeenLevel }),
      hasHydrated: false,
    }),
    {
      name: 'waystone.progress',
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => () => {
        useProgressSeen.setState({ hasHydrated: true });
      },
    },
  ),
);
