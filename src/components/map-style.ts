import type { StyleSpecification } from '@maplibre/maplibre-react-native';

/**
 * El estilo `dark` de OpenFreeMap tal cual viene es casi monocromo: fondo,
 * agua y calles secundarias caen todos dentro de un rango de ~20 valores
 * de gris cerca del negro (fondo rgb(12,12,12), calle secundaria #181818,
 * camino peatonal igual que el agua) — cuesta distinguir calles y
 * edificios (queja de Lucas). Se pide el mismo JSON (mismas tiles/sprites/
 * glyphs, sin tocar nada de red) y se sube el contraste de un puñado de
 * capas reusando los pasos de luz que ya tiene la paleta de la app
 * (pizarra → cara de la piedra → piedra iluminada, ver constants/theme.ts)
 * en vez de inventar grises nuevos.
 */
const BASE_STYLE_URL = 'https://tiles.openfreemap.org/styles/dark';

const STONE = {
  background: '#161B1E',
  backgroundElement: '#222A2E',
  backgroundSelected: '#2E383D',
  textSecondary: '#94A39F',
};

let cached: StyleSpecification | null = null;

function byId(style: StyleSpecification, id: string) {
  return style.layers.find((l) => l.id === id) as
    | (StyleSpecification['layers'][number] & { paint?: Record<string, unknown> })
    | undefined;
}

function setColor(style: StyleSpecification, id: string, prop: string, color: string) {
  const layer = byId(style, id);
  if (layer?.paint && prop in layer.paint) layer.paint[prop] = color;
}

function patch(style: StyleSpecification) {
  setColor(style, 'background', 'background-color', STONE.background);
  setColor(style, 'water', 'fill-color', '#101619');
  setColor(style, 'waterway', 'line-color', '#101619');
  setColor(style, 'building', 'fill-color', STONE.backgroundElement);
  // el camino peatonal tenía el mismo color que el agua: ahora un liquen tenue
  setColor(style, 'highway_path', 'line-color', 'rgba(148,163,159,0.45)');
  setColor(style, 'highway_minor', 'line-color', STONE.backgroundSelected);
  setColor(style, 'highway_major_casing', 'line-color', 'rgba(148,163,159,0.5)');
  setColor(style, 'highway_major_inner', 'line-color', '#3C474C');
  setColor(style, 'highway_major_subtle', 'line-color', '#3C474C');
  setColor(style, 'highway_motorway_casing', 'line-color', 'rgba(148,163,159,0.5)');
  setColor(style, 'highway_motorway_subtle', 'line-color', '#3C474C');
  for (const layer of style.layers as (StyleSpecification['layers'][number] & {
    paint?: Record<string, unknown>;
  })[]) {
    if (layer.type === 'symbol' && layer.paint && 'text-color' in layer.paint) {
      layer.paint['text-color'] = STONE.textSecondary;
    }
  }
}

/**
 * Devuelve el estilo `dark` con el contraste subido. Si la petición falla o
 * tarda más de 4 s (sin red, o colgada), devuelve la URL de siempre y
 * MapLibre la resuelve él mismo — mismo fallback que había antes de este
 * cambio. No cachea el fallback: el siguiente montaje vuelve a intentarlo.
 */
export async function loadMapStyle(): Promise<string | StyleSpecification> {
  if (cached) return cached;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(BASE_STYLE_URL, { signal: controller.signal });
    const style = (await res.json()) as StyleSpecification;
    patch(style);
    cached = style;
    return style;
  } catch {
    return BASE_STYLE_URL;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Estilo ya resuelto en esta sesión de la app, sin volver a pedirlo. `null`
 * si todavía no se ha cargado — quien lo use debe esperar a `loadMapStyle`
 * antes de montar el mapa, para no cambiarle el estilo en caliente (recarga
 * el estilo entero de golpe en el nativo y puede perder la línea de ruta si
 * cae en la ventana en que sus capas siguen en cola).
 */
export function getCachedMapStyle(): string | StyleSpecification | null {
  return cached;
}
