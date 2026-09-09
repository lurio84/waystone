import { StyleSheet, View, type ViewProps } from 'react-native';

import { Carve, Chamfer, Colors, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type StonePanelProps = ViewProps & {
  /** Color de la cara de la piedra. */
  tone?: Extract<ThemeColor, 'backgroundElement' | 'backgroundSelected'>;
  /** Línea tallada arriba/abajo. Desactivar en paneles anidados. */
  carved?: boolean;
};

/**
 * Una losa: esquina superior derecha achaflanada a 45°, sin radio, con una
 * incisión de luz arriba y sombra abajo. El chaflán es un cuadrado girado
 * del color del fondo de página superpuesto a la esquina — sin dependencias.
 */
export function StonePanel({
  children,
  tone = 'backgroundElement',
  carved = true,
  style,
  ...rest
}: StonePanelProps) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.base,
        { backgroundColor: theme[tone] },
        carved && styles.carved,
        style,
      ]}
      {...rest}
    >
      {children}
      <View style={styles.chamfer} pointerEvents="none" />
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    padding: Spacing.three,
    // sin borderRadius: la piedra no tiene esquinas redondeadas
  },
  carved: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: Carve.top,
    borderBottomColor: Carve.bottom,
  },
  chamfer: {
    position: 'absolute',
    top: -Chamfer,
    right: -Chamfer,
    width: Chamfer * 2,
    height: Chamfer * 2,
    backgroundColor: Colors.dark.background,
    transform: [{ rotate: '45deg' }],
  },
});
