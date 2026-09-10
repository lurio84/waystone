/**
 * Waystone es un mojón de piedra tallado al borde del camino. Solo modo
 * oscuro: la paleta piedra/pizarra + musgo + ámbar + óxido no tiene una
 * versión clara honesta, y correr al amanecer o al anochecer pide fondo
 * oscuro. Los tres acentos son un sistema semántico, no decoración:
 * musgo actúa, ámbar avisa, óxido cierra.
 */

import '@/global.css';

import { Platform } from 'react-native';

const palette = {
  background: '#161B1E', // pizarra mojada
  backgroundElement: '#222A2E', // la cara de la piedra
  backgroundSelected: '#2E383D', // piedra iluminada
  text: '#E8E4DA', // caliza / hueso
  textSecondary: '#94A39F', // liquen
  primary: '#7D9B4E', // musgo = acción
  warn: '#D9A441', // ámbar = atención
  danger: '#B4553F', // óxido = terminar / destructivo
} as const;

/** Una sola paleta: la app es dark-only. `light`/`dark` apuntan a lo mismo
 *  para no romper a quien indexe por esquema. */
export const Colors = { light: palette, dark: palette } as const;

export type ThemeColor = keyof typeof palette;

/** Borde tallado: una cara más clara, otra más oscura — lee como incisión
 *  en la piedra, no como el borde de una tarjeta. */
export const Carve = {
  top: 'rgba(232, 228, 218, 0.10)', // luz rasante desde arriba
  bottom: 'rgba(0, 0, 0, 0.28)', // sombra abajo
} as const;

/** Chaflán a 45° en una esquina de cada panel: la firma de la forma. */
export const Chamfer = 14;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
    /** Inscripciones: Cinzel, capital romana tallada. Nunca datos. */
    display: 'Cinzel_600SemiBold',
    displayBold: 'Cinzel_700Bold',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
    display: 'Cinzel_600SemiBold',
    displayBold: 'Cinzel_700Bold',
  },
  web: {
    sans: 'system-ui, sans-serif',
    serif: 'Georgia, serif',
    rounded: 'system-ui, sans-serif',
    mono: 'monospace',
    display: 'Cinzel, Georgia, serif',
    displayBold: 'Cinzel, Georgia, serif',
  },
})!;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
