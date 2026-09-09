import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface SettingsState {
  /** Mini-mapa en vivo en la pantalla de carrera. Se puede apagar si tira
   *  de batería o rendimiento en una tirada larga. */
  liveMap: boolean;
  setLiveMap: (v: boolean) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      liveMap: true,
      setLiveMap: (liveMap) => set({ liveMap }),
    }),
    { name: 'zancada.settings', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
