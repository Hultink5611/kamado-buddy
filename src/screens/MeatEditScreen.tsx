import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Alert, Switch } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../App';
import { useApp } from '../state/AppContext';
import { slugMeatId, isBuiltinMeat } from '../logic/cook';
import type { CookMethod, Meat } from '../logic/types';
import { theme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'MeatEdit'>;

const METHODS: { key: CookMethod; label: string }[] = [
  { key: 'direct', label: 'Direct' },
  { key: 'indirect', label: 'Indirect' },
  { key: 'reverse', label: 'Reverse sear' },
];

/** Empty draft for a brand-new meat. */
const BLANK: Meat = {
  id: '',
  name: '',
  emoji: '🍖',
  category: '',
  method: 'indirect',
  domeTempC: 150,
  coreTempC: 68,
  flipIntervalMin: null,
  estimate: { type: 'weight', baseMin: 30, minPerKg: 60 },
  frozenFactor: 1.5,
  restMin: 5,
  temperMin: 30,
  tips: '',
};

export default function MeatEditScreen(_props: Props) {
  const { meats, saveMeat, deleteMeat } = useApp();
  const [draft, setDraft] = useState<Meat | null>(null);

  const remove = (m: Meat) =>
    Alert.alert('Verwijderen?', `"${m.name}" uit je lijst halen?`, [
      { text: 'Annuleer' },
      { text: 'Verwijder', style: 'destructive', onPress: () => void deleteMeat(m.id) },
    ]);

  if (draft) {
    return <MeatForm draft={draft} onCancel={() => setDraft(null)} onSave={async (m) => { await saveMeat(m); setDraft(null); }} />;
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Pressable style={styles.newBtn} onPress={() => setDraft({ ...BLANK })}>
        <Text style={styles.newBtnText}>+ Nieuw vlees</Text>
      </Pressable>

      {meats.map((m) => (
        <View key={m.id} style={styles.row}>
          <Text style={styles.rowEmoji}>{m.emoji}</Text>
          <View style={styles.rowMid}>
            <Text style={styles.rowName}>{m.name}</Text>
            <Text style={styles.rowSub}>
              {m.category} · dome {m.domeTempC}°{m.coreTempC != null ? ` · kern ${m.coreTempC}°` : ''}
              {!isBuiltinMeat(m.id) ? ' · eigen' : ''}
            </Text>
          </View>
          <Pressable style={styles.rowBtn} onPress={() => setDraft({ ...m })}>
            <Text style={styles.rowBtnText}>Bewerk</Text>
          </Pressable>
          <Pressable style={styles.rowBtn} onPress={() => remove(m)}>
            <Text style={[styles.rowBtnText, { color: theme.colors.danger }]}>Wis</Text>
          </Pressable>
        </View>
      ))}

      <Text style={styles.hint}>
        Ingebouwde stukken bewerken/verwijderen kan ook — dat overschrijft of verbergt ze alleen voor jou; je originele data blijft veilig.
      </Text>
    </ScrollView>
  );
}

function MeatForm({ draft, onCancel, onSave }: { draft: Meat; onCancel: () => void; onSave: (m: Meat) => void }) {
  const [name, setName] = useState(draft.name);
  const [emoji, setEmoji] = useState(draft.emoji);
  const [category, setCategory] = useState(draft.category);
  const [method, setMethod] = useState<CookMethod>(draft.method);
  const [dome, setDome] = useState(String(draft.domeTempC));
  const [core, setCore] = useState(draft.coreTempC == null ? '' : String(draft.coreTempC));
  const [flip, setFlip] = useState(draft.flipIntervalMin == null ? '' : String(draft.flipIntervalMin));
  const [rest, setRest] = useState(String(draft.restMin));
  const [temper, setTemper] = useState(draft.temperMin == null ? '' : String(draft.temperMin));
  const [byWeight, setByWeight] = useState(draft.estimate.type === 'weight');
  const [baseMin, setBaseMin] = useState(String(draft.estimate.baseMin));
  const [perUnit, setPerUnit] = useState(
    String((draft.estimate.type === 'weight' ? draft.estimate.minPerKg : draft.estimate.minPerCm) ?? '')
  );
  const [frozen, setFrozen] = useState(String(draft.frozenFactor));
  const [tips, setTips] = useState(draft.tips);
  const [story, setStory] = useState(draft.story ?? '');

  const numOr = (s: string, fb: number) => {
    const n = parseFloat(s.replace(',', '.'));
    return isNaN(n) ? fb : n;
  };

  const save = () => {
    if (!name.trim()) {
      Alert.alert('Naam ontbreekt', 'Geef het vlees een naam.');
      return;
    }
    const type = byWeight ? 'weight' : 'thickness';
    const perNum = perUnit.trim() ? numOr(perUnit, 0) : undefined;
    const meat: Meat = {
      ...draft,
      id: draft.id || slugMeatId(name),
      name: name.trim(),
      emoji: emoji.trim() || '🍖',
      category: category.trim() || 'Overig',
      method,
      domeTempC: numOr(dome, 150),
      coreTempC: core.trim() ? numOr(core, 68) : null,
      flipIntervalMin: flip.trim() ? numOr(flip, 0) : null,
      restMin: numOr(rest, 5),
      temperMin: temper.trim() ? numOr(temper, 30) : 0,
      estimate: {
        type,
        baseMin: numOr(baseMin, 30),
        minPerKg: type === 'weight' ? perNum : undefined,
        minPerCm: type === 'thickness' ? perNum : undefined,
      },
      frozenFactor: numOr(frozen, 1.5),
      tips: tips.trim(),
      story: story.trim() || undefined,
    };
    onSave(meat);
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Field label="Naam"><TextInput style={styles.input} value={name} onChangeText={setName} placeholder="bijv. Picanha" placeholderTextColor={theme.colors.textDim} /></Field>
      <View style={styles.two}>
        <Field label="Emoji" flex={0.4}><TextInput style={styles.input} value={emoji} onChangeText={setEmoji} placeholder="🥩" placeholderTextColor={theme.colors.textDim} /></Field>
        <Field label="Categorie" flex={1}><TextInput style={styles.input} value={category} onChangeText={setCategory} placeholder="bijv. Rund" placeholderTextColor={theme.colors.textDim} /></Field>
      </View>

      <Field label="Methode">
        <View style={styles.seg}>
          {METHODS.map((m) => (
            <Pressable key={m.key} style={[styles.segBtn, method === m.key && styles.segBtnSel]} onPress={() => setMethod(m.key)}>
              <Text style={[styles.segText, method === m.key && { color: '#0d0f12' }]}>{m.label}</Text>
            </Pressable>
          ))}
        </View>
      </Field>

      <View style={styles.two}>
        <Field label="Dome/BBQ-temp (°C)" flex={1}><TextInput style={styles.input} value={dome} onChangeText={setDome} keyboardType="numeric" placeholderTextColor={theme.colors.textDim} /></Field>
        <Field label="Kerntemp (°C, leeg = n.v.t.)" flex={1}><TextInput style={styles.input} value={core} onChangeText={setCore} keyboardType="numeric" placeholder="leeg = geen" placeholderTextColor={theme.colors.textDim} /></Field>
      </View>

      <View style={styles.two}>
        <Field label="Omdraai-interval (min, leeg = niet)" flex={1}><TextInput style={styles.input} value={flip} onChangeText={setFlip} keyboardType="numeric" placeholder="leeg" placeholderTextColor={theme.colors.textDim} /></Field>
        <Field label="Rusttijd (min)" flex={1}><TextInput style={styles.input} value={rest} onChangeText={setRest} keyboardType="numeric" placeholderTextColor={theme.colors.textDim} /></Field>
      </View>

      <Field label="Laten temperen voor 't erop gaat (min)"><TextInput style={styles.input} value={temper} onChangeText={setTemper} keyboardType="numeric" placeholder="0 = direct erop" placeholderTextColor={theme.colors.textDim} /></Field>

      <View style={styles.inlineRow}>
        <Text style={styles.label}>Tijd schatten op gewicht (anders dikte)</Text>
        <Switch value={byWeight} onValueChange={setByWeight} trackColor={{ true: theme.colors.accent }} />
      </View>
      <View style={styles.two}>
        <Field label="Basistijd (min)" flex={1}><TextInput style={styles.input} value={baseMin} onChangeText={setBaseMin} keyboardType="numeric" placeholderTextColor={theme.colors.textDim} /></Field>
        <Field label={byWeight ? 'Min per kg' : 'Min per cm'} flex={1}><TextInput style={styles.input} value={perUnit} onChangeText={setPerUnit} keyboardType="numeric" placeholderTextColor={theme.colors.textDim} /></Field>
      </View>

      <Field label="Diepvries-factor (×tijd)"><TextInput style={styles.input} value={frozen} onChangeText={setFrozen} keyboardType="numeric" placeholderTextColor={theme.colors.textDim} /></Field>
      <Field label="Tips"><TextInput style={[styles.input, styles.multi]} value={tips} onChangeText={setTips} multiline placeholder="Korte bereidingstip" placeholderTextColor={theme.colors.textDim} /></Field>
      <Field label="📖 Zo doen de meesten het"><TextInput style={[styles.input, styles.multi]} value={story} onChangeText={setStory} multiline placeholder="bijv. Direct zonder deflector rond 200°C, deksel dicht, 2x keren…" placeholderTextColor={theme.colors.textDim} /></Field>

      <View style={styles.two}>
        <Pressable style={[styles.saveBtn, styles.cancelBtn]} onPress={onCancel}><Text style={styles.cancelText}>Annuleer</Text></Pressable>
        <Pressable style={styles.saveBtn} onPress={save}><Text style={styles.saveText}>Opslaan</Text></Pressable>
      </View>
    </ScrollView>
  );
}

function Field({ label, children, flex }: { label: string; children: React.ReactNode; flex?: number }) {
  return (
    <View style={[styles.field, flex != null && { flex }]}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: theme.space(4), gap: theme.space(3) },
  newBtn: { backgroundColor: theme.colors.accent, borderRadius: theme.radius, paddingVertical: 14, alignItems: 'center' },
  newBtnText: { color: '#0d0f12', fontWeight: '700', fontSize: theme.font.body },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.colors.card, borderRadius: theme.radius, padding: theme.space(3) },
  rowEmoji: { fontSize: 24 },
  rowMid: { flex: 1, gap: 2 },
  rowName: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '600' },
  rowSub: { color: theme.colors.textDim, fontSize: theme.font.small },
  rowBtn: { paddingHorizontal: 10, paddingVertical: 6, backgroundColor: theme.colors.cardAlt, borderRadius: 10 },
  rowBtnText: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '600' },
  hint: { color: theme.colors.textDim, fontSize: theme.font.small, lineHeight: 19, marginTop: 4 },
  field: { gap: 4 },
  two: { flexDirection: 'row', gap: theme.space(3), alignItems: 'flex-end' },
  label: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '600' },
  input: { backgroundColor: theme.colors.cardAlt, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: theme.colors.text },
  multi: { minHeight: 70, textAlignVertical: 'top' },
  inlineRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  seg: { flexDirection: 'row', gap: 8 },
  segBtn: { flex: 1, backgroundColor: theme.colors.cardAlt, borderRadius: 10, paddingVertical: 8, alignItems: 'center' },
  segBtnSel: { backgroundColor: theme.colors.accent },
  segText: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '600' },
  saveBtn: { flex: 1, backgroundColor: theme.colors.accent, borderRadius: theme.radius, paddingVertical: 14, alignItems: 'center' },
  saveText: { color: '#0d0f12', fontWeight: '700', fontSize: theme.font.body },
  cancelBtn: { backgroundColor: theme.colors.cardAlt },
  cancelText: { color: theme.colors.text, fontWeight: '700', fontSize: theme.font.body },
});
