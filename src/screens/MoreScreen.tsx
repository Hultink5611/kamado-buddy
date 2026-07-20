import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { MainTabParamList, RootStackParamList } from '../App';
import { useApp } from '../state/AppContext';
import { theme } from '../theme';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'More'>,
  NativeStackScreenProps<RootStackParamList>
>;

type MoreRoute = 'Logbook' | 'MeatEdit' | 'Calibration' | 'Settings' | 'Setup';

export default function MoreScreen({ navigation }: Props) {
  const { settings } = useApp();
  const setupSub = settings.bbq
    ? `${settings.bbq.brand} ${settings.bbq.model}${settings.thermo ? ` · ${settings.thermo.brand} ${settings.thermo.model}` : ''}`
    : 'Stel je BBQ en thermometer in';
  const ITEMS: { emoji: string; label: string; sub: string; route: MoreRoute }[] = [
    { emoji: '🔧', label: 'Mijn setup', sub: setupSub, route: 'Setup' },
    { emoji: '📓', label: 'Logboek', sub: 'Al je grill-sessies met foto\'s en notities', route: 'Logbook' },
    { emoji: '🍖', label: 'Vlees beheren', sub: 'Stukken toevoegen, bewerken of verwijderen', route: 'MeatEdit' },
    { emoji: '🎯', label: 'Kalibratie', sub: 'IJk je meter tegen kokend/ijswater', route: 'Calibration' },
    { emoji: '⚙️', label: 'Instellingen', sub: 'AI-sleutels, thuishub, alarmen en data', route: 'Settings' },
  ];
  return (
    <ScrollView contentContainerStyle={styles.content}>
      {ITEMS.map((it) => (
        <Pressable key={it.route} style={styles.row} onPress={() => navigation.navigate(it.route)}>
          <Text style={styles.emoji}>{it.emoji}</Text>
          <View style={styles.mid}>
            <Text style={styles.label}>{it.label}</Text>
            <Text style={styles.sub}>{it.sub}</Text>
          </View>
          <Text style={styles.chev}>›</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: theme.space(4), gap: theme.space(2) },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: theme.colors.card, borderRadius: theme.radius, padding: theme.space(4) },
  emoji: { fontSize: 26, width: 34, textAlign: 'center' },
  mid: { flex: 1, gap: 2 },
  label: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '600' },
  sub: { color: theme.colors.textDim, fontSize: theme.font.small },
  chev: { color: theme.colors.textDim, fontSize: 24 },
});
