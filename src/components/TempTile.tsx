import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../theme';

interface Props {
  label: string;
  valueC: number | null;
  targetC?: number | null;
  color: string;
}

export default function TempTile({ label, valueC, targetC, color }: Props) {
  return (
    <View style={styles.tile}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, { color }]}>
        {valueC == null ? '––' : Math.round(valueC)}
        <Text style={styles.unit}>°C</Text>
      </Text>
      {targetC != null && <Text style={styles.target}>doel {targetC}°</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius,
    padding: theme.space(4),
  },
  label: { color: theme.colors.textDim, fontSize: theme.font.small, marginBottom: 4 },
  value: { fontSize: theme.font.big, fontWeight: '700' },
  unit: { fontSize: theme.font.h2, fontWeight: '600' },
  target: { color: theme.colors.textDim, fontSize: theme.font.small, marginTop: 2 },
});
