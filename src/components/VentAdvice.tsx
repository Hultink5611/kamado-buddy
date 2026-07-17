import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../theme';
import { ventLabel } from '../logic/cook';
import type { SteerAdvice } from '../logic/steering';

const STATUS_COLOR: Record<string, string> = {
  stable: theme.colors.target,
  too_hot: theme.colors.danger,
  too_cold: theme.colors.warn,
  closing_in: theme.colors.warn,
  no_data: theme.colors.textDim,
};

export default function VentAdvice({ advice }: { advice: SteerAdvice }) {
  const color = STATUS_COLOR[advice.status] ?? theme.colors.textDim;
  return (
    <View style={[styles.card, { borderLeftColor: color }]}>
      <Text style={[styles.headline, { color }]}>{advice.headline}</Text>
      <Text style={styles.detail}>{advice.detail}</Text>
      <View style={styles.row}>
        <Vent label="Onderschuif" value={advice.suggestedBottom} />
        <Vent label="Bovenklep" value={advice.suggestedTop} />
      </View>
      <Text style={styles.coal}>🔥 Kolen: {advice.coalFill} · {advice.bandLabel}</Text>
    </View>
  );
}

function Vent({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.vent}>
      <Text style={styles.ventLabel}>{label}</Text>
      <Text style={styles.ventValue}>{ventLabel(value)}</Text>
      <View style={styles.bar}>
        <View style={[styles.barFill, { width: `${Math.round(value * 100)}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius,
    borderLeftWidth: 4,
    padding: theme.space(4),
    gap: theme.space(2),
  },
  headline: { fontSize: theme.font.h2, fontWeight: '700' },
  detail: { color: theme.colors.text, fontSize: theme.font.body, lineHeight: 21 },
  row: { flexDirection: 'row', gap: theme.space(3), marginTop: theme.space(1) },
  vent: { flex: 1 },
  ventLabel: { color: theme.colors.textDim, fontSize: theme.font.small },
  ventValue: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '600', marginVertical: 2 },
  bar: { height: 6, backgroundColor: theme.colors.cardAlt, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: 6, backgroundColor: theme.colors.accent },
  coal: { color: theme.colors.textDim, fontSize: theme.font.small, marginTop: 2 },
});
