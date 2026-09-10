import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface SettingsState {
  /** Mini-mapa en vivo en la pantalla de carrera. Por defecto APAGADO: una
   *  superficie GL nativa + refiltrado de puntos cada 2 s con la app en
   *  background es batería y superficie de crash a cambio de nada que el
   *  historial no dé después. Se enciende a mano cuando la grabación sea sólida. */
  liveMap: boolean;
  setLiveMap: (v: boolean) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      liveMap: false,
      setLiveMap: (liveMap) => set({ liveMap }),
    }),
    { name: 'waystone.settings', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
