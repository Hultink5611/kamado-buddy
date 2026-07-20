import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Image } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../App';
import { listCooks } from '../storage/db';
import type { Cook } from '../logic/types';
import { theme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Logbook'>;

export default function LogbookScreen({ navigation }: Props) {
  const [cooks, setCooks] = useState<Cook[]>([]);

  useFocusEffect(
    useCallback(() => {
      listCooks().then(setCooks);
    }, [])
  );

  if (cooks.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Nog geen cooks. Start je eerste en 'ie verschijnt hier.</Text>
      </View>
    );
  }

  return (
    <FlatList
      contentContainerStyle={styles.content}
      data={cooks}
      keyExtractor={(c) => c.id}
      renderItem={({ item }) => {
        const d = new Date(item.startedAt);
        const mins = item.endedAt ? Math.round((item.endedAt - item.startedAt) / 60000) : 0;
        const peakMeat = Math.max(0, ...item.samples.map((s) => s.meatC ?? 0));
        return (
          <Pressable style={styles.row} onPress={() => navigation.navigate('CookDetail', { cookId: item.id })}>
            {item.resultPhotoUri ? (
              <Image source={{ uri: item.resultPhotoUri }} style={styles.thumb} />
            ) : (
              <Text style={styles.emoji}>{'🍖'}</Text>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>
                {item.meatName}{item.input.marinadeName ? ` · 🧂 ${item.input.marinadeName}` : ''}
              </Text>
              <Text style={styles.meta}>
                {d.toLocaleDateString('nl-NL')} · {mins} min · piek kern {Math.round(peakMeat)}°
              </Text>
            </View>
            <Text style={styles.chev}>›</Text>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: theme.space(4), gap: theme.space(2) },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.space(6) },
  emptyText: { color: theme.colors.textDim, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.colors.card, borderRadius: theme.radius, padding: theme.space(4) },
  emoji: { fontSize: 24, width: 44, textAlign: 'center' },
  thumb: { width: 44, height: 44, borderRadius: 8, backgroundColor: theme.colors.cardAlt },
  name: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '600' },
  meta: { color: theme.colors.textDim, fontSize: theme.font.small, marginTop: 2 },
  chev: { color: theme.colors.textDim, fontSize: 24 },
});
