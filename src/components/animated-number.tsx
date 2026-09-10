import { useEffect } from 'react';
import { StyleSheet, TextInput, type TextStyle } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

// El contador anima la prop nativa `text` de un TextInput (no `value`: Reanimated
// no reacciona a cambios de `value`). Un Text normal no se puede animar así.
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

type Props = {
  /** Valor final. El contador sube desde 0 hasta aquí al montar y en cada cambio. */
  value: number;
  /** WORKLET: convierte el valor animado en el texto a pintar. */
  format: (n: number) => string;
  durationMs?: number;
  style?: TextStyle | TextStyle[];
};

/**
 * Un número que cuenta hasta su valor. El texto se calcula en el hilo de UI
 * desde un shared value, así que la cuenta va fluida aunque el JS esté ocupado.
 * Respeta "reducir movimiento" del sistema.
 */
export function AnimatedNumber({ value, format, durationMs = 900, style }: Props) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(value, {
      duration: durationMs,
      easing: Easing.out(Easing.cubic),
      reduceMotion: ReduceMotion.System,
    });
  }, [value, durationMs, progress]);

  // `text` es prop nativa del TextInput pero no está en TextInputProps; el cast
  // es el patrón habitual para este truco del contador.
  const animatedProps = useAnimatedProps(() => ({ text: format(progress.value) }) as never);

  return (
    <AnimatedTextInput
      editable={false}
      pointerEvents="none"
      underlineColorAndroid="transparent"
      value={format(value)}
      style={[styles.reset, style]}
      animatedProps={animatedProps}
    />
  );
}

const styles = StyleSheet.create({
  // Un TextInput trae padding y altura mínima propios; los quitamos para que
  // ocupe lo mismo que el Text al que sustituye.
  reset: { padding: 0, margin: 0 },
});
