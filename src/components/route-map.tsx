import {
  Camera,
  GeoJSONSource,
  Layer,
  LogManager,
  Map,
  Marker,
} from '@maplibre/maplibre-react-native';
import { useMemo } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

// MapLibre es ruidoso en consola; solo errores de verdad.
LogManager.setLogLevel('error');

/**
 * Tiles vectoriales gratis, sin API key ni registro. Si algún día cae, el
 * fallback natural es raster de OSM — pero la línea de ruta se dibuja igual
 * porque es GeoJSON local.
 */
const STYLE_URL = 'https://tiles.openfreemap.org/styles/dark';

export interface RouteMapProps {
  /**
   * La traza partida en tramos continuos (ver `routeSegments` en
   * `src/core/metrics.ts`): un tramo por cada corte de pausa o hueco de GPS.
   * Se dibuja una `LineString` por tramo en vez de una sola línea que
   * cruzaría el corte en recta.
   */
  segments: { lat: number; lon: number }[][];
  /** modo en vivo: la cámara sigue al último punto en vez de encuadrar la ruta */
  follow?: boolean;
  style?: ViewStyle;
}

export function RouteMap({ segments, follow = false, style }: RouteMapProps) {
  const theme = useTheme();

  const coordSegments = useMemo(
    () => segments.map((seg) => seg.map((p) => [p.lon, p.lat] as [number, number])),
    [segments],
  );

  const totalPoints = useMemo(
    () => coordSegments.reduce((n, seg) => n + seg.length, 0),
    [coordSegments],
  );

  const line = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: coordSegments
        .filter((seg) => seg.length >= 2)
        .map((seg) => ({
          type: 'Feature' as const,
          geometry: { type: 'LineString' as const, coordinates: seg },
          properties: {},
        })),
    }),
    [coordSegments],
  );

  const bounds = useMemo<[number, number, number, number] | null>(() => {
    if (totalPoints < 2) return null;
    let w = Infinity;
    let e = -Infinity;
    let s = Infinity;
    let n = -Infinity;
    for (const seg of coordSegments) {
      for (const [lon, lat] of seg) {
        if (lon < w) w = lon;
        if (lon > e) e = lon;
        if (lat < s) s = lat;
        if (lat > n) n = lat;
      }
    }
    return [w, s, e, n];
  }, [coordSegments, totalPoints]);

  if (totalPoints < 2) return null;

  const nonEmptySegments = coordSegments.filter((seg) => seg.length > 0);
  const first = nonEmptySegments[0][0];
  const last = nonEmptySegments[nonEmptySegments.length - 1].at(-1)!;

  return (
    <View style={[styles.wrap, style]}>
      <Map mapStyle={STYLE_URL} style={StyleSheet.absoluteFill} logo={false} compass={false}>
        {follow ? (
          <Camera center={last} zoom={15.5} easing="ease" duration={500} />
        ) : (
          bounds && (
            <Camera
              bounds={bounds}
              padding={{ top: 48, bottom: 48, left: 32, right: 32 }}
              duration={0}
            />
          )
        )}

        <GeoJSONSource id="route" data={line}>
          <Layer
            type="line"
            id="route-line"
            style={{
              lineColor: theme.warn,
              lineWidth: 4,
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />
        </GeoJSONSource>

        <Marker lngLat={first}>
          <View style={[styles.dot, { backgroundColor: theme.primary, borderColor: theme.background }]} />
        </Marker>
        {!follow && (
          <Marker lngLat={last}>
            <View style={[styles.dot, { backgroundColor: theme.danger, borderColor: theme.background }]} />
          </Marker>
        )}
      </Map>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden' },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
});
