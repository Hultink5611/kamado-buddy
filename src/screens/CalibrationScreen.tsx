import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { useApp } from '../state/AppContext';
import { saveLearned } from '../storage/db';
import { upsertLearned } from '../logic/learning';
import { bandForTarget } from '../logic/steering';
import { ventLabel } from '../logic/cook';
import { theme } from '../theme';

const TARGETS = [110, 150, 180, 220, 250];
const VENT_STEPS = [
  { label: 'dicht', v: 0.1 },
  { label: 'kwart', v: 0.3 },
  { label: 'half', v: 0.5 },
  { label: 'driekwart', v: 0.75 },
  { label: 'heel', v: 1.0 },
];

export default function CalibrationScreen() {
  const { ink, settings, learned, reloadLearned } = useApp();
  const [target, setTarget] = useState(150);
  const [bottom, setBottom] = useState(0.5);
  const [top, setTop] = useState(0.5);

  const ambient = ink.channels[settings.ambientChannel] ?? null;

  const save = async () => {
    if (ambient == null) {
      Alert.alert('Geen omgevingstemp', 'Verbind de meter en clip een probe op het rooster, dan lees ik de stabiele temp uit.');
      return;
    }
    const next = upsertLearned(learned, target, bottom, top, ambient, Date.now());
    await saveLearned(next);
    await reloadLearned();
    Alert.alert('Opgeslagen', `Bij ${ventLabel(bottom)} onder / ${ventLabel(top)} boven werd het ${Math.round(ambient)}°C. Onthouden voor doel ~${target}°C.`);
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.info}>
        Stook bewust naar een doeltemp, wacht tot 'ie stabiel is, en leg vast welke klepstanden dat gaven. De app gebruikt jouw waardes voortaan als startpunt.
      </Text>

      <Text style={styles.h}>Doeltemperatuur</Text>
      <View style={styles.row}>
        {TARGETS.map((t) => (
          <Pressable key={t} style={[styles.chip, target === t && styles.chipSel]} onPress={() => setTarget(t)}>
            <Text style={[styles.chipText, target === t && { color: '#0d0f12' }]}>{t}°</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.band}>{bandForTarget(target).label} · {bandForTarget(target).coalFill}</Text>

      <View style={styles.live}>
        <Text style={styles.liveLabel}>Nu gemeten (omgeving)</Text>
        <Text style={styles.liveValue}>{ambient == null ? '––' : `${Math.round(ambient)}°C`}</Text>
      </View>

      <Text style={styles.h}>Onderschuif</Text>
      <VentRow value={bottom} onChange={setBottom} />
      <Text style={styles.h}>Bovenklep</Text>
      <VentRow value={top} onChange={setTop} />

      <Pressable style={styles.save} onPress={save}>
        <Text style={styles.saveText}>Sla deze stabiele stand op</Text>
      </Pressable>

      {learned.length > 0 && (
        <View style={styles.learned}>
          <Text style={styles.h}>Geleerd voor jouw grill</Text>
          {learned
            .sort((a, b) => a.bandMaxC - b.bandMaxC)
            .map((l) => (
              <Text key={l.bandMaxC} style={styles.learnedRow}>
                tot {l.bandMaxC}°: onder {ventLabel(l.bottomVent)}, boven {ventLabel(l.topVent)} ({l.samples}x)
              </Text>
            ))}
        </View>
      )}
    </ScrollView>
  );
}

function VentRow({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <View style={styles.row}>
      {VENT_STEPS.map((s) => (
        <Pressable key={s.label} style={[styles.chip, Math.abs(value - s.v) < 0.06 && styles.chipSel]} onPress={() => onChange(s.v)}>
          <Text style={[styles.chipText, Math.abs(value - s.v) < 0.06 && { color: '#0d0f12' }]}>{s.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: theme.space(4), gap: theme.space(3) },
  info: { color: theme.colors.textDim, fontSize: theme.font.small, lineHeight: 20 },
  h: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700', marginTop: 4 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: theme.colors.card, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14 },
  chipSel: { backgroundColor: theme.colors.accent },
  chipText: { color: theme.colors.text, fontSize: theme.font.body },
  band: { color: theme.colors.textDim, fontSize: theme.font.small },
  live: { backgroundColor: theme.colors.card, borderRadius: theme.radius, padding: theme.space(4), alignItems: 'center' },
  liveLabel: { color: theme.colors.textDim, fontSize: theme.font.small },
  liveValue: { color: theme.colors.ambient, fontSize: theme.font.big, fontWeight: '700' },
  save: { backgroundColor: theme.colors.accent, borderRadius: theme.radius, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  saveText: { color: '#0d0f12', fontWeight: '700', fontSize: theme.font.body },
  learned: { gap: 6, marginTop: 8 },
  learnedRow: { color: theme.colors.textDim, fontSize: theme.font.small },
});
