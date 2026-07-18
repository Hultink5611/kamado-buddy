import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Alert, Image, ActivityIndicator, Modal } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { useApp } from '../state/AppContext';
import { listMarinades, saveMarinade, deleteMarinade } from '../storage/db';
import { suggestMarinade } from '../ai/steerAI';
import type { Marinade, Meat } from '../logic/types';
import { theme } from '../theme';

const blankMarinade = (): Marinade => ({
  id: `marinade-${Date.now()}`,
  name: '',
  forMeat: '',
  meatId: undefined,
  amount: '',
  ingredients: '',
  method: '',
  note: '',
  rating: undefined,
  photoUri: undefined,
  createdAt: Date.now(),
});

/** Dropdown to pick a meat/vegetable from the list. */
function CutPicker({
  meats,
  value,
  placeholder,
  allowAll,
  onSelect,
}: {
  meats: Meat[];
  value?: string; // meatId
  placeholder: string;
  allowAll?: boolean;
  onSelect: (meat: Meat | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = meats.find((m) => m.id === value);
  return (
    <>
      <Pressable style={styles.dropdown} onPress={() => setOpen(true)}>
        <Text style={selected ? styles.dropdownVal : styles.dropdownPlaceholder}>
          {selected ? `${selected.emoji} ${selected.name}` : placeholder}
        </Text>
        <Text style={styles.caret}>▾</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Kies vlees of groente</Text>
            <ScrollView>
              {allowAll && (
                <Pressable style={styles.sheetRow} onPress={() => { onSelect(null); setOpen(false); }}>
                  <Text style={styles.sheetEmoji}>🍽️</Text>
                  <Text style={styles.sheetName}>Alle</Text>
                </Pressable>
              )}
              {meats.map((m) => (
                <Pressable key={m.id} style={styles.sheetRow} onPress={() => { onSelect(m); setOpen(false); }}>
                  <Text style={styles.sheetEmoji}>{m.emoji}</Text>
                  <Text style={styles.sheetName}>{m.name}</Text>
                  <Text style={styles.sheetCat}>{m.category}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

export default function MarinadesScreen() {
  const { settings, meats } = useApp();
  const [marinades, setMarinades] = useState<Marinade[]>([]);
  const [draft, setDraft] = useState<Marinade | null>(null);
  const [filterId, setFilterId] = useState<string | undefined>(undefined);
  const [aiBusy, setAiBusy] = useState(false);

  const reload = useCallback(() => {
    listMarinades().then(setMarinades);
  }, []);
  useFocusEffect(reload);

  const filterMeat = meats.find((m) => m.id === filterId);
  const shown = useMemo(
    () => (filterId ? marinades.filter((m) => m.meatId === filterId) : marinades),
    [marinades, filterId]
  );

  const askAI = async () => {
    if (!settings.keys.openaiKey && !settings.keys.geminiKey && !settings.keys.groqKey) {
      Alert.alert('Geen AI-sleutel', 'Stel een AI-sleutel in bij Instellingen.');
      return;
    }
    if (!filterMeat) {
      Alert.alert('Kies eerst een stuk', 'Selecteer bovenaan een vlees of groente.');
      return;
    }
    setAiBusy(true);
    try {
      const s = await suggestMarinade(settings.keys, filterMeat.name);
      setDraft({
        ...blankMarinade(),
        name: s.name,
        forMeat: filterMeat.name,
        meatId: filterMeat.id,
        amount: s.amount,
        ingredients: s.ingredients,
        method: s.method,
      });
    } catch (e) {
      Alert.alert('AI mislukt', String(e));
    } finally {
      setAiBusy(false);
    }
  };

  if (draft) {
    return (
      <MarinadeForm
        draft={draft}
        meats={meats}
        onCancel={() => setDraft(null)}
        onSave={async (m) => { await saveMarinade(m); setDraft(null); reload(); }}
        onDelete={async (id) => { await deleteMarinade(id); setDraft(null); reload(); }}
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.aiCard}>
        <Text style={styles.aiH}>✨ Marinades per stuk</Text>
        <Text style={styles.hint}>Kies een vlees of groente. Je ziet dan de opgeslagen marinades ervoor — en laat de AI er nieuwe bij bedenken.</Text>
        <CutPicker meats={meats} value={filterId} placeholder="Kies vlees of groente" allowAll onSelect={(m) => setFilterId(m?.id)} />
        <View style={styles.aiRow}>
          <Pressable style={[styles.aiBtn, { flex: 1 }]} onPress={askAI} disabled={aiBusy}>
            {aiBusy ? <ActivityIndicator color="#0d0f12" /> : <Text style={styles.aiBtnText}>{filterMeat ? `Bedenk voor ${filterMeat.name}` : 'Bedenk marinade'}</Text>}
          </Pressable>
        </View>
      </View>

      <View style={styles.listHead}>
        <Text style={styles.listTitle}>{filterMeat ? `Marinades voor ${filterMeat.name}` : 'Alle marinades'}</Text>
        <Pressable onPress={() => setDraft({ ...blankMarinade(), meatId: filterId, forMeat: filterMeat?.name })}>
          <Text style={styles.addLink}>+ Zelf toevoegen</Text>
        </Pressable>
      </View>

      {shown.length === 0 ? (
        <Text style={styles.empty}>
          {filterMeat ? `Nog geen marinades voor ${filterMeat.name}. Laat de AI er een bedenken.` : 'Nog geen marinades. Kies een stuk en laat de AI er een bedenken.'}
        </Text>
      ) : (
        shown.map((m) => (
          <Pressable key={m.id} style={styles.row} onPress={() => setDraft({ ...m })}>
            {m.photoUri ? <Image source={{ uri: m.photoUri }} style={styles.thumb} /> : <Text style={styles.rowEmoji}>🧂</Text>}
            <View style={styles.rowMid}>
              <Text style={styles.rowName}>{m.name || 'Naamloos'}</Text>
              <Text style={styles.rowSub}>{m.forMeat || 'algemeen'}{m.rating != null ? ` · ${m.rating}/10` : ''}</Text>
              {m.amount ? <Text style={styles.rowAmount}>🍽️ voor {m.amount}</Text> : null}
            </View>
            <Text style={styles.chev}>›</Text>
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}

function MarinadeForm({
  draft,
  meats,
  onCancel,
  onSave,
  onDelete,
}: {
  draft: Marinade;
  meats: Meat[];
  onCancel: () => void;
  onSave: (m: Marinade) => void;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState(draft.name);
  const [meatId, setMeatId] = useState<string | undefined>(draft.meatId);
  const [forMeat, setForMeat] = useState(draft.forMeat ?? '');
  const [amount, setAmount] = useState(draft.amount ?? '');
  const [ingredients, setIngredients] = useState(draft.ingredients);
  const [method, setMethod] = useState(draft.method ?? '');
  const [note, setNote] = useState(draft.note ?? '');
  const [rating, setRating] = useState<number | undefined>(draft.rating);
  const [photoUri, setPhotoUri] = useState<string | undefined>(draft.photoUri);

  const addPhoto = (fromCamera: boolean) => async () => {
    const res = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.6 })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.6 });
    if (res.canceled || !res.assets[0]) return;
    let uri = res.assets[0].uri;
    try {
      const dest = `${FileSystem.documentDirectory}marinade-${draft.id}.jpg`;
      await FileSystem.copyAsync({ from: uri, to: dest });
      uri = dest;
    } catch {
      /* keep original uri */
    }
    setPhotoUri(uri);
  };

  const choosePhoto = () =>
    Alert.alert('Foto', 'Waar vandaan?', [
      { text: 'Camera', onPress: () => void addPhoto(true)() },
      { text: 'Galerij', onPress: () => void addPhoto(false)() },
      { text: 'Annuleer', style: 'cancel' },
    ]);

  const save = () => {
    if (!name.trim()) {
      Alert.alert('Naam ontbreekt', 'Geef de marinade een naam.');
      return;
    }
    onSave({
      ...draft,
      name: name.trim(),
      meatId,
      forMeat: forMeat.trim() || undefined,
      amount: amount.trim() || undefined,
      ingredients: ingredients.trim(),
      method: method.trim() || undefined,
      note: note.trim() || undefined,
      rating,
      photoUri,
    });
  };

  const remove = () =>
    Alert.alert('Verwijderen?', `"${name || 'deze marinade'}" verwijderen?`, [
      { text: 'Annuleer' },
      { text: 'Verwijder', style: 'destructive', onPress: () => onDelete(draft.id) },
    ]);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Field label="Naam"><TextInput style={styles.input} value={name} onChangeText={setName} placeholder="bijv. Koreaanse gochujang" placeholderTextColor={theme.colors.textDim} /></Field>
      <Field label="Voor welk vlees / groente">
        <CutPicker
          meats={meats}
          value={meatId}
          placeholder={forMeat || 'Kies uit de lijst'}
          onSelect={(m) => { setMeatId(m?.id); if (m) setForMeat(m.name); }}
        />
      </Field>
      <Field label="Voor hoeveel"><TextInput style={styles.input} value={amount} onChangeText={setAmount} placeholder="bijv. 4 hamburgers (~600 g)" placeholderTextColor={theme.colors.textDim} /></Field>
      <Field label="Ingrediënten"><TextInput style={[styles.input, styles.multi]} value={ingredients} onChangeText={setIngredients} multiline placeholder="Eén per regel, met hoeveelheden" placeholderTextColor={theme.colors.textDim} /></Field>
      <Field label="Methode / marineertijd"><TextInput style={[styles.input, styles.multi]} value={method} onChangeText={setMethod} multiline placeholder="Hoe aanmaken + hoe lang marineren" placeholderTextColor={theme.colors.textDim} /></Field>

      <Field label="Cijfer">
        <View style={styles.ratingRow}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
            <Pressable key={n} style={[styles.ratePill, rating === n && styles.ratePillSel]} onPress={() => setRating(rating === n ? undefined : n)}>
              <Text style={[styles.ratePillText, rating === n && { color: '#0d0f12' }]}>{n}</Text>
            </Pressable>
          ))}
        </View>
      </Field>

      <Field label="Opmerking"><TextInput style={[styles.input, styles.multi]} value={note} onChangeText={setNote} multiline placeholder="Wat vond je ervan? Volgende keer anders?" placeholderTextColor={theme.colors.textDim} /></Field>

      <View style={styles.photoBlock}>
        <Text style={styles.label}>Foto</Text>
        {photoUri ? (
          <Pressable onPress={choosePhoto}><Image source={{ uri: photoUri }} style={styles.photo} /></Pressable>
        ) : (
          <Pressable style={styles.photoBtn} onPress={choosePhoto}><Text style={styles.photoBtnText}>📷 Foto toevoegen</Text></Pressable>
        )}
      </View>

      <View style={styles.two}>
        <Pressable style={[styles.saveBtn, styles.cancelBtn]} onPress={onCancel}><Text style={styles.cancelText}>Annuleer</Text></Pressable>
        <Pressable style={styles.saveBtn} onPress={save}><Text style={styles.saveText}>Opslaan</Text></Pressable>
      </View>
      <Pressable style={styles.del} onPress={remove}><Text style={styles.delText}>Verwijderen</Text></Pressable>
    </ScrollView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: theme.space(4), gap: theme.space(3) },
  aiCard: { backgroundColor: theme.colors.card, borderRadius: theme.radius, padding: theme.space(4), gap: theme.space(2) },
  aiH: { color: theme.colors.text, fontSize: theme.font.h2, fontWeight: '700' },
  aiRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  aiBtn: { backgroundColor: theme.colors.accent, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  aiBtnText: { color: '#0d0f12', fontWeight: '700' },
  listHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  listTitle: { color: theme.colors.text, fontSize: theme.font.h2, fontWeight: '700' },
  addLink: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '600' },
  empty: { color: theme.colors.textDim, textAlign: 'center', padding: theme.space(4) },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.colors.card, borderRadius: theme.radius, padding: theme.space(3) },
  rowEmoji: { fontSize: 24, width: 44, textAlign: 'center' },
  thumb: { width: 44, height: 44, borderRadius: 8, backgroundColor: theme.colors.cardAlt },
  rowMid: { flex: 1, gap: 2 },
  rowName: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '600' },
  rowSub: { color: theme.colors.textDim, fontSize: theme.font.small },
  rowAmount: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '600' },
  chev: { color: theme.colors.textDim, fontSize: 24 },
  field: { gap: 4 },
  label: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '600' },
  hint: { color: theme.colors.textDim, fontSize: theme.font.small, lineHeight: 19 },
  input: { backgroundColor: theme.colors.cardAlt, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: theme.colors.text },
  multi: { minHeight: 80, textAlignVertical: 'top' },
  dropdown: { backgroundColor: theme.colors.cardAlt, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dropdownVal: { color: theme.colors.text, fontSize: theme.font.body },
  dropdownPlaceholder: { color: theme.colors.textDim, fontSize: theme.font.body },
  caret: { color: theme.colors.textDim, fontSize: 14 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: theme.colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: theme.space(4), maxHeight: '70%' },
  sheetTitle: { color: theme.colors.text, fontSize: theme.font.h2, fontWeight: '700', marginBottom: theme.space(2) },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.line },
  sheetEmoji: { fontSize: 22, width: 30, textAlign: 'center' },
  sheetName: { color: theme.colors.text, fontSize: theme.font.body, flex: 1 },
  sheetCat: { color: theme.colors.textDim, fontSize: theme.font.small },
  ratingRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  ratePill: { width: 34, height: 34, borderRadius: 17, backgroundColor: theme.colors.cardAlt, alignItems: 'center', justifyContent: 'center' },
  ratePillSel: { backgroundColor: theme.colors.accent },
  ratePillText: { color: theme.colors.text, fontWeight: '700' },
  photoBlock: { gap: 6 },
  photo: { width: '100%', height: 220, borderRadius: theme.radius, backgroundColor: theme.colors.card },
  photoBtn: { backgroundColor: theme.colors.card, borderRadius: theme.radius, paddingVertical: theme.space(6), alignItems: 'center' },
  photoBtnText: { color: theme.colors.textDim },
  two: { flexDirection: 'row', gap: theme.space(3) },
  saveBtn: { flex: 1, backgroundColor: theme.colors.accent, borderRadius: theme.radius, paddingVertical: 14, alignItems: 'center' },
  saveText: { color: '#0d0f12', fontWeight: '700', fontSize: theme.font.body },
  cancelBtn: { backgroundColor: theme.colors.cardAlt },
  cancelText: { color: theme.colors.text, fontWeight: '700', fontSize: theme.font.body },
  del: { paddingVertical: 12, alignItems: 'center' },
  delText: { color: theme.colors.danger, fontWeight: '600' },
});
