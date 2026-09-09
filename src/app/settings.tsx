import { StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StonePanel } from '@/components/stone-panel';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSettings } from '@/store/settings';

export default function SettingsScreen() {
  const theme = useTheme();
  const liveMap = useSettings((s) => s.liveMap);
  const setLiveMap = useSettings((s) => s.setLiveMap);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <StonePanel style={styles.row}>
          <View style={styles.rowText}>
            <ThemedText type="inscription" themeColor="textSecondary">
              Mapa en vivo
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Muestra el recorrido en un mini-mapa mientras corres. Apágalo si
              notas que tira de batería o va a tirones en tiradas largas.
            </ThemedText>
          </View>
          <Switch
            value={liveMap}
            onValueChange={setLiveMap}
            trackColor={{ true: theme.primary }}
          />
        </StonePanel>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1, padding: Spacing.three },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  rowText: { flex: 1, gap: Spacing.one },
});
