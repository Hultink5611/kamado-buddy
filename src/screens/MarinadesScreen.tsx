import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Alert, Image, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { useApp } from '../state/AppContext';
import { listMarinades, saveMarinade, deleteMarinade } from '../storage/db';
import { suggestMarinade } from '../ai/steerAI';
import type { Marinade } from '../logic/types';
import { theme } from '../theme';

const blankMarinade = (): Marinade => ({
  id: `marinade-${Date.now()}`,
  name: '',
  forMeat: '',
  ingredients: '',
  method: '',
  note: '',
  rating: undefined,
  photoUri: undefined,
  createdAt: Date.now(),
});

export default function MarinadesScreen() {
  const { settings } = useApp();
  const [marinades, setMarinades] = useState<Marinade[]>([]);
  const [draft, setDraft] = useState<Marinade | null>(null);
  const [cut, setCut] = useState('');
  const [aiBusy, setAiBusy] = useState(false);

  const reload = useCallback(() => {
    listMarinades().then(setMarinades);
  }, []);
  useFocusEffect(reload);

  const askAI = async () => {
    if (!settings.keys.openaiKey && !settings.keys.geminiKey && !settings.keys.groqKey) {
      Alert.alert('Geen AI-sleutel', 'Stel een AI-sleutel in bij Instellingen.');
      return;
    }
    if (!cut.trim()) {
      Alert.alert('Voor welk vlees?', 'Vul eerst een stuk vlees in (bijv. short rib).');
      return;
    }
    setAiBusy(true);
    try {
      const s = await suggestMarinade(settings.keys, cut.trim());
      setDraft({ ...blankMarinade(), name: s.name, forMeat: cut.trim(), ingredients: s.ingredients, method: s.method });
      setCut('');
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
        onCancel={() => setDraft(null)}
        onSave={async (m) => {
          await saveMarinade(m);
          setDraft(null);
          reload();
        }}
        onDelete={async (id) => {
          await deleteMarinade(id);
          setDraft(null);
          reload();
        }}
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.aiCard}>
        <Text style={styles.aiH}>✨ Ontdek een marinade</Text>
        <Text style={styles.hint}>Laat de AI een marinade bedenken voor een stuk vlees. Daarna opslaan met foto, opmerking en cijfer.</Text>
        <View style={styles.aiRow}>
          <TextInput style={[styles.input, { flex: 1 }]} value={cut} onChangeText={setCut} placeholder="bijv. short rib" placeholderTextColor={theme.colors.textDim} />
          <Pressable style={styles.aiBtn} onPress={askAI} disabled={aiBusy}>
            {aiBusy ? <ActivityIndicator color="#0d0f12" /> : <Text style={styles.aiBtnText}>Bedenk</Text>}
          </Pressable>
        </View>
      </View>

      <Pressable style={styles.newBtn} onPress={() => setDraft(blankMarinade())}>
        <Text style={styles.newBtnText}>+ Zelf een marinade toevoegen</Text>
      </Pressable>

      {marinades.length === 0 ? (
        <Text style={styles.empty}>Nog geen marinades. Laat de AI er een bedenken of voeg er zelf een toe.</Text>
      ) : (
        marinades.map((m) => (
          <Pressable key={m.id} style={styles.row} onPress={() => setDraft({ ...m })}>
            {m.photoUri ? <Image source={{ uri: m.photoUri }} style={styles.thumb} /> : <Text style={styles.rowEmoji}>🧂</Text>}
            <View style={styles.rowMid}>
              <Text style={styles.rowName}>{m.name || 'Naamloos'}</Text>
              <Text style={styles.rowSub}>{m.forMeat || 'algemeen'}{m.rating != null ? ` · ${m.rating}/10` : ''}</Text>
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
  onCancel,
  onSave,
  onDelete,
}: {
  draft: Marinade;
  onCancel: () => void;
  onSave: (m: Marinade) => void;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState(draft.name);
  const [forMeat, setForMeat] = useState(draft.forMeat ?? '');
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
      forMeat: forMeat.trim() || undefined,
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
      <Field label="Voor welk vlees"><TextInput style={styles.input} value={forMeat} onChangeText={setForMeat} placeholder="bijv. short rib" placeholderTextColor={theme.colors.textDim} /></Field>
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
  aiBtn: { backgroundColor: theme.colors.accent, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', minWidth: 84 },
  aiBtnText: { color: '#0d0f12', fontWeight: '700' },
  newBtn: { backgroundColor: theme.colors.cardAlt, borderRadius: theme.radius, paddingVertical: 14, alignItems: 'center' },
  newBtnText: { color: theme.colors.text, fontWeight: '700' },
  empty: { color: theme.colors.textDim, textAlign: 'center', padding: theme.space(4) },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.colors.card, borderRadius: theme.radius, padding: theme.space(3) },
  rowEmoji: { fontSize: 24, width: 44, textAlign: 'center' },
  thumb: { width: 44, height: 44, borderRadius: 8, backgroundColor: theme.colors.cardAlt },
  rowMid: { flex: 1, gap: 2 },
  rowName: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '600' },
  rowSub: { color: theme.colors.textDim, fontSize: theme.font.small },
  chev: { color: theme.colors.textDim, fontSize: 24 },
  field: { gap: 4 },
  label: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '600' },
  hint: { color: theme.colors.textDim, fontSize: theme.font.small, lineHeight: 19 },
  input: { backgroundColor: theme.colors.cardAlt, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: theme.colors.text },
  multi: { minHeight: 80, textAlignVertical: 'top' },
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
