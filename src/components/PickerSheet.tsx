import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Modal } from 'react-native';
import { theme } from '../theme';

export interface PickerOption {
  id: string;
  label: string;
  sub?: string;
  emoji?: string;
}

/**
 * A single-select dropdown that opens a bottom sheet. Reused for the meat/
 * vegetable picker and the marinade picker.
 */
export default function PickerSheet({
  options,
  value,
  placeholder,
  title,
  noneLabel,
  onSelect,
}: {
  options: PickerOption[];
  value?: string;
  placeholder: string;
  title: string;
  /** When set, adds a "none" row at the top that selects `undefined`. */
  noneLabel?: string;
  onSelect: (id: string | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.id === value);
  return (
    <>
      <Pressable style={styles.dropdown} onPress={() => setOpen(true)}>
        <Text style={selected ? styles.val : styles.placeholder} numberOfLines={1}>
          {selected ? `${selected.emoji ? selected.emoji + ' ' : ''}${selected.label}` : placeholder}
        </Text>
        <Text style={styles.caret}>▾</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <ScrollView>
              {noneLabel && (
                <Pressable style={styles.row} onPress={() => { onSelect(undefined); setOpen(false); }}>
                  <Text style={styles.emoji}>—</Text>
                  <Text style={styles.name}>{noneLabel}</Text>
                </Pressable>
              )}
              {options.map((o) => (
                <Pressable key={o.id} style={styles.row} onPress={() => { onSelect(o.id); setOpen(false); }}>
                  <Text style={styles.emoji}>{o.emoji ?? '•'}</Text>
                  <Text style={styles.name} numberOfLines={1}>{o.label}</Text>
                  {o.sub ? <Text style={styles.sub} numberOfLines={1}>{o.sub}</Text> : null}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  dropdown: { backgroundColor: theme.colors.cardAlt, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  val: { color: theme.colors.text, fontSize: theme.font.body, flex: 1 },
  placeholder: { color: theme.colors.textDim, fontSize: theme.font.body, flex: 1 },
  caret: { color: theme.colors.textDim, fontSize: 14 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: theme.colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: theme.space(4), maxHeight: '70%' },
  sheetTitle: { color: theme.colors.text, fontSize: theme.font.h2, fontWeight: '700', marginBottom: theme.space(2) },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.line },
  emoji: { fontSize: 22, width: 30, textAlign: 'center' },
  name: { color: theme.colors.text, fontSize: theme.font.body, flex: 1 },
  sub: { color: theme.colors.textDim, fontSize: theme.font.small },
});
