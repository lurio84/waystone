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
  points: { lat: number; lon: number }[];
  /** modo en vivo: la cámara sigue al último punto en vez de encuadrar la ruta */
  follow?: boolean;
  style?: ViewStyle;
}

export function RouteMap({ points, follow = false, style }: RouteMapProps) {
  const theme = useTheme();

  const coords = useMemo(() => points.map((p) => [p.lon, p.lat] as [number, number]), [points]);

  const line = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          geometry: { type: 'LineString' as const, coordinates: coords },
          properties: {},
        },
      ],
    }),
    [coords],
  );

  const bounds = useMemo<[number, number, number, number] | null>(() => {
    if (coords.length < 2) return null;
    let w = coords[0][0];
    let e = coords[0][0];
    let s = coords[0][1];
    let n = coords[0][1];
    for (const [lon, lat] of coords) {
      if (lon < w) w = lon;
      if (lon > e) e = lon;
      if (lat < s) s = lat;
      if (lat > n) n = lat;
    }
    return [w, s, e, n];
  }, [coords]);

  if (coords.length < 2) return null;

  const last = coords[coords.length - 1];

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

        <Marker lngLat={coords[0]}>
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
