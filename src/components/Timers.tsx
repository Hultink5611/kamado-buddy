import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput } from 'react-native';
import { theme } from '../theme';
import { fireAlarm } from '../logic/notifications';

interface Props {
  startedAt: number;
  flipIntervalMin: number | null;
  /** When the meat was last flipped (drives the countdown + "late" counter). */
  lastFlipAt: number;
  /** Called when the user taps the flip block ("I just flipped"). */
  onFlipReset: () => void;
}

function fmt(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

interface CustomTimer {
  id: number;
  label: string;
  endsAt: number;
  fired: boolean;
}

export default function Timers({ startedAt, flipIntervalMin, lastFlipAt, onFlipReset }: Props) {
  const [now, setNow] = useState(Date.now());
  const [customs, setCustoms] = useState<CustomTimer[]>([]);
  const [newMin, setNewMin] = useState('2');
  const [newLabel, setNewLabel] = useState('');

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Flip timer — counts down to the next flip, then counts UP ("te laat") until
  // the user taps to confirm they flipped. The notification itself is fired by
  // the cook engine (so it works even off this screen).
  const flipSecLeft = useMemo(() => {
    if (!flipIntervalMin) return null;
    const elapsed = (now - lastFlipAt) / 1000;
    return flipIntervalMin * 60 - elapsed;
  }, [now, flipIntervalMin, lastFlipAt]);
  const late = flipSecLeft != null && flipSecLeft < 0;

  // Custom timers
  useEffect(() => {
    setCustoms((prev) =>
      prev.map((t) => {
        if (!t.fired && now >= t.endsAt) {
          void fireAlarm('⏰ Timer', t.label || 'Je timer is afgelopen.');
          return { ...t, fired: true };
        }
        return t;
      })
    );
  }, [now]);

  const addTimer = () => {
    const mins = parseFloat(newMin.replace(',', '.'));
    if (!mins || mins <= 0) return;
    setCustoms((prev) => [
      ...prev,
      { id: Date.now(), label: newLabel.trim() || `${mins} min`, endsAt: Date.now() + mins * 60000, fired: false },
    ]);
    setNewLabel('');
  };

  const totalElapsed = (now - startedAt) / 1000;

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.block}>
          <Text style={styles.label}>Totaal op de BBQ</Text>
          <Text style={styles.big}>{fmt(totalElapsed)}</Text>
        </View>
        {flipIntervalMin != null && (
          <Pressable style={styles.block} onPress={onFlipReset}>
            <Text style={styles.label}>{late ? 'Draaien — te laat! (tik = gedraaid)' : 'Draaien over (tik = gedraaid)'}</Text>
            <Text
              style={[
                styles.big,
                { color: late ? theme.colors.danger : (flipSecLeft ?? 1) < 15 ? theme.colors.warn : theme.colors.text },
              ]}
            >
              {flipSecLeft == null ? '–' : late ? `+${fmt(-flipSecLeft)}` : fmt(flipSecLeft)}
            </Text>
          </Pressable>
        )}
      </View>

      {customs.length > 0 && (
        <View style={styles.customs}>
          {customs.map((t) => (
            <View key={t.id} style={styles.customRow}>
              <Text style={[styles.customLabel, t.fired && { color: theme.colors.textDim }]}>{t.label}</Text>
              <Text style={[styles.customTime, t.fired && { color: theme.colors.textDim }]}>
                {t.fired ? 'klaar' : fmt((t.endsAt - now) / 1000)}
              </Text>
              <Pressable onPress={() => setCustoms((p) => p.filter((x) => x.id !== t.id))}>
                <Text style={styles.remove}>✕</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}

      <View style={styles.addRow}>
        <TextInput
          style={[styles.input, { flex: 2 }]}
          placeholder="Label (bijv. kaas erop)"
          placeholderTextColor={theme.colors.textDim}
          value={newLabel}
          onChangeText={setNewLabel}
        />
        <TextInput
          style={[styles.input, { width: 56 }]}
          keyboardType="numeric"
          value={newMin}
          onChangeText={setNewMin}
        />
        <Text style={styles.min}>min</Text>
        <Pressable style={styles.addBtn} onPress={addTimer}>
          <Text style={styles.addBtnText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: theme.colors.card, borderRadius: theme.radius, padding: theme.space(4), gap: theme.space(3) },
  row: { flexDirection: 'row', gap: theme.space(3) },
  block: { flex: 1, backgroundColor: theme.colors.cardAlt, borderRadius: 12, padding: theme.space(3) },
  label: { color: theme.colors.textDim, fontSize: theme.font.small },
  big: { color: theme.colors.text, fontSize: theme.font.h1, fontWeight: '700', marginTop: 2 },
  customs: { gap: 6 },
  customRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  customLabel: { flex: 1, color: theme.colors.text, fontSize: theme.font.body },
  customTime: { color: theme.colors.accent, fontSize: theme.font.body, fontWeight: '600' },
  remove: { color: theme.colors.textDim, fontSize: 16, paddingHorizontal: 4 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    backgroundColor: theme.colors.cardAlt,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: theme.colors.text,
  },
  min: { color: theme.colors.textDim },
  addBtn: { backgroundColor: theme.colors.accent, borderRadius: 10, width: 40, height: 38, alignItems: 'center', justifyContent: 'center' },
  addBtnText: { color: '#0d0f12', fontSize: 22, fontWeight: '700' },
});
