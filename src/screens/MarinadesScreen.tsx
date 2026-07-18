import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Alert, Image, ActivityIndicator, Modal } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { useApp } from '../state/AppContext';
import { listMarinades, saveMarinade, deleteMarinade } from '../storage/db';
import { suggestMarinade, scaleMarinade, searchMarinade, enrichMarinade } from '../ai/steerAI';
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
  title,
  allowAll,
  onSelect,
}: {
  meats: Meat[];
  value?: string; // meatId
  placeholder: string;
  title?: string;
  allowAll?: boolean;
  onSelect: (meat: Meat | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = meats.find((m) => m.id === value);
  return (
    <>
      <Pressable style={styles.dropdown} onPress={() => setOpen(true)}>
        <Text style={selected ? styles.dropdownVal : styles.dropdownPlaceholder} numberOfLines={1}>
          {selected ? `${selected.emoji} ${selected.name}` : placeholder}
        </Text>
        <Text style={styles.caret}>▾</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{title ?? 'Kies vlees of groente'}</Text>
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

/** Cuisine styles the 🎲 random button rolls from (client-side, so it's really random). */
const RANDOM_STYLES = [
  'Surinaamse', 'Koreaanse', 'Mexicaanse', 'Thaise', 'Marokkaanse', 'Argentijnse',
  'Japanse', 'Griekse', 'Indiase', 'Caribische', 'Texaanse', 'Libanese',
  'Indonesische', 'Italiaanse', 'Franse', 'Portugese', 'Turkse', 'Cubaanse',
];

export default function MarinadesScreen() {
  const { settings, meats } = useApp();
  const [marinades, setMarinades] = useState<Marinade[]>([]);
  const [draft, setDraft] = useState<Marinade | null>(null);
  const [filterId, setFilterId] = useState<string | undefined>(undefined);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<null | 'suggest' | 'search' | 'random'>(null);

  const reload = useCallback(() => {
    listMarinades().then(setMarinades);
  }, []);
  useFocusEffect(reload);

  // Separate dropdowns: meats vs vegetables.
  const meatCuts = useMemo(() => meats.filter((m) => m.category !== 'Groente'), [meats]);
  const vegCuts = useMemo(() => meats.filter((m) => m.category === 'Groente'), [meats]);

  const filterMeat = meats.find((m) => m.id === filterId);
  const shown = useMemo(
    () => (filterId ? marinades.filter((m) => m.meatId === filterId) : marinades),
    [marinades, filterId]
  );

  const hasKeys = !!(settings.keys.openaiKey || settings.keys.geminiKey || settings.keys.groqKey);
  const needKeys = () => {
    Alert.alert('Geen AI-sleutel', 'Stel een AI-sleutel in bij Instellingen.');
  };

  /** Match an AI "forMeat" string back to a meat in the list. */
  const matchCut = (forMeat: string): Meat | undefined => {
    const q = forMeat.toLowerCase();
    return meats.find(
      (mt) => q.includes(mt.name.toLowerCase()) || mt.name.toLowerCase().includes(q)
    );
  };

  const askAI = async () => {
    if (!hasKeys) return needKeys();
    if (!filterMeat) {
      Alert.alert('Kies eerst een stuk', 'Selecteer bovenaan een vlees of groente.');
      return;
    }
    setBusy('suggest');
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
      setBusy(null);
    }
  };

  const randomAI = async () => {
    if (!hasKeys) return needKeys();
    // Cut: the selected one, or a random pick. Style: always a random cuisine.
    const pool = filterMeat ? [filterMeat] : meats;
    const cut = pool[Math.floor(Math.random() * pool.length)];
    const style = RANDOM_STYLES[Math.floor(Math.random() * RANDOM_STYLES.length)];
    setBusy('random');
    try {
      const s = await suggestMarinade(settings.keys, cut.name, style);
      setDraft({
        ...blankMarinade(),
        name: s.name,
        forMeat: cut.name,
        meatId: cut.id,
        amount: s.amount,
        ingredients: s.ingredients,
        method: s.method,
      });
    } catch (e) {
      Alert.alert('AI mislukt', String(e));
    } finally {
      setBusy(null);
    }
  };

  const searchAI = async () => {
    if (!hasKeys) return needKeys();
    const q = query.trim();
    if (!q) {
      Alert.alert('Typ eerst wat je zoekt', 'Bijvoorbeeld: pittige Surinaamse kip.');
      return;
    }
    setBusy('search');
    try {
      const s = await searchMarinade(settings.keys, q, meats.map((mt) => mt.name));
      const cut = s.forMeat ? matchCut(s.forMeat) : undefined;
      setDraft({
        ...blankMarinade(),
        name: s.name,
        forMeat: cut?.name ?? s.forMeat,
        meatId: cut?.id,
        amount: s.amount,
        ingredients: s.ingredients,
        method: s.method,
      });
    } catch (e) {
      Alert.alert('AI mislukt', String(e));
    } finally {
      setBusy(null);
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
        <Text style={styles.hint}>Kies een vlees óf een groente. Je ziet dan de opgeslagen marinades ervoor — en laat de AI er nieuwe bij bedenken.</Text>
        <View style={styles.pickRow}>
          <View style={{ flex: 1 }}>
            <CutPicker
              meats={meatCuts}
              value={meatCuts.some((m) => m.id === filterId) ? filterId : undefined}
              placeholder="🥩 Vlees"
              title="Kies vlees"
              allowAll
              onSelect={(m) => setFilterId(m?.id)}
            />
          </View>
          <View style={{ flex: 1 }}>
            <CutPicker
              meats={vegCuts}
              value={vegCuts.some((m) => m.id === filterId) ? filterId : undefined}
              placeholder="🥬 Groente"
              title="Kies groente"
              allowAll
              onSelect={(m) => setFilterId(m?.id)}
            />
          </View>
        </View>
        <View style={styles.aiRow}>
          <Pressable style={[styles.aiBtn, { flex: 1 }]} onPress={askAI} disabled={busy != null}>
            {busy === 'suggest' ? <ActivityIndicator color="#0d0f12" /> : <Text style={styles.aiBtnText}>{filterMeat ? `Bedenk voor ${filterMeat.name}` : 'Bedenk marinade'}</Text>}
          </Pressable>
          <Pressable style={[styles.aiBtn, styles.aiBtnAlt]} onPress={randomAI} disabled={busy != null}>
            {busy === 'random' ? <ActivityIndicator color={theme.colors.text} /> : <Text style={styles.aiBtnAltText}>🎲 Random</Text>}
          </Pressable>
        </View>
      </View>

      <View style={styles.aiCard}>
        <Text style={styles.aiH}>🔍 Zoek met AI</Text>
        <Text style={styles.hint}>Omschrijf wat je zoekt — bijv. “pittige Surinaamse kip” — en de AI vindt het recept.</Text>
        <View style={styles.aiRow}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={query}
            onChangeText={setQuery}
            placeholder="bijv. pittige Surinaamse kip"
            placeholderTextColor={theme.colors.textDim}
            returnKeyType="search"
            onSubmitEditing={searchAI}
          />
          <Pressable style={styles.aiBtn} onPress={searchAI} disabled={busy != null}>
            {busy === 'search' ? <ActivityIndicator color="#0d0f12" /> : <Text style={styles.aiBtnText}>Zoek</Text>}
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
  const { settings } = useApp();
  const [name, setName] = useState(draft.name);
  const [meatId, setMeatId] = useState<string | undefined>(draft.meatId);
  const [forMeat, setForMeat] = useState(draft.forMeat ?? '');
  const [amount, setAmount] = useState(draft.amount ?? '');
  const [ingredients, setIngredients] = useState(draft.ingredients);
  const [method, setMethod] = useState(draft.method ?? '');
  const [note, setNote] = useState(draft.note ?? '');
  const [rating, setRating] = useState<number | undefined>(draft.rating);
  const [photoUri, setPhotoUri] = useState<string | undefined>(draft.photoUri);
  const [target, setTarget] = useState('');
  const [scaling, setScaling] = useState(false);
  const [enriching, setEnriching] = useState(false);

  // Placeholder voor "Voor hoeveel": gebruik het gekozen stuk, nooit hardcoded "hamburgers".
  const cutName = (meats.find((m) => m.id === meatId)?.name || forMeat).trim();
  const amountPlaceholder = cutName ? `bijv. 4 ${cutName.toLowerCase()} (~500 g)` : 'bijv. 4 stuks (~600 g)';

  const hasKeys = () => {
    if (settings.keys.openaiKey || settings.keys.geminiKey || settings.keys.groqKey) return true;
    Alert.alert('Geen AI-sleutel', 'Stel een AI-sleutel in bij Instellingen.');
    return false;
  };

  // AI vult "voor hoeveel" + bereidingswijze aan, zonder de ingrediënten te wijzigen.
  const enrich = async () => {
    if (!hasKeys()) return;
    if (!ingredients.trim()) {
      Alert.alert('Geen ingrediënten', 'Voeg eerst ingrediënten toe.');
      return;
    }
    setEnriching(true);
    try {
      const r = await enrichMarinade(settings.keys, {
        name: name || 'marinade',
        forMeat: forMeat || undefined,
        amount: amount || undefined,
        ingredients,
        method: method || undefined,
      });
      setAmount(r.amount);
      if (r.method) setMethod(r.method);
    } catch (e) {
      Alert.alert('Aanvullen mislukt', String(e));
    } finally {
      setEnriching(false);
    }
  };

  // AI-herberekening: vloeistoffen ~evenredig, kruiden sub-lineair.
  const rescale = async () => {
    if (!settings.keys.openaiKey && !settings.keys.geminiKey && !settings.keys.groqKey) {
      Alert.alert('Geen AI-sleutel', 'Stel een AI-sleutel in bij Instellingen.');
      return;
    }
    const t = target.trim();
    if (!t) {
      Alert.alert('Vul een aantal in', 'Bijvoorbeeld "8 hamburgers" of "1,2 kg kip".');
      return;
    }
    if (!ingredients.trim()) {
      Alert.alert('Geen ingrediënten', 'Er valt nog niets te herberekenen.');
      return;
    }
    setScaling(true);
    try {
      const r = await scaleMarinade(settings.keys, {
        name: name || 'marinade',
        forMeat: forMeat || undefined,
        amount: amount || undefined,
        ingredients,
        method: method || undefined,
        target: t,
      });
      setAmount(r.amount);
      setIngredients(r.ingredients);
      if (r.method) setMethod(r.method);
      setTarget('');
    } catch (e) {
      Alert.alert('Herberekenen mislukt', String(e));
    } finally {
      setScaling(false);
    }
  };

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
      <Field label="Voor hoeveel">
        <TextInput style={styles.input} value={amount} onChangeText={setAmount} placeholder={amountPlaceholder} placeholderTextColor={theme.colors.textDim} />
        <Pressable style={styles.enrichBtn} onPress={enrich} disabled={enriching}>
          {enriching ? <ActivityIndicator color={theme.colors.accent} /> : <Text style={styles.enrichText}>✨ Laat AI 'voor hoeveel' + bereiding invullen</Text>}
        </Pressable>
      </Field>
      <Field label="Ingrediënten"><TextInput style={[styles.input, styles.multi]} value={ingredients} onChangeText={setIngredients} multiline placeholder="Eén per regel, met hoeveelheden" placeholderTextColor={theme.colors.textDim} /></Field>
      <Field label="Methode / marineertijd (incl. hoe grillen)"><TextInput style={[styles.input, styles.multi]} value={method} onChangeText={setMethod} multiline placeholder="Aanmaken + marineertijd + hoe grillen: folie, rooster, grillplaat of spies" placeholderTextColor={theme.colors.textDim} /></Field>

      <Field label="🔢 Herbereken naar ander aantal (AI)">
        <View style={styles.aiRow}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={target}
            onChangeText={setTarget}
            placeholder="bijv. 8 hamburgers of 1,2 kg"
            placeholderTextColor={theme.colors.textDim}
            returnKeyType="done"
            onSubmitEditing={rescale}
          />
          <Pressable style={styles.aiBtn} onPress={rescale} disabled={scaling}>
            {scaling ? <ActivityIndicator color="#0d0f12" /> : <Text style={styles.aiBtnText}>Herbereken</Text>}
          </Pressable>
        </View>
        <Text style={styles.hint}>De AI schaalt vloeistoffen evenredig mee en kruiden iets voorzichtiger.</Text>
      </Field>

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
  aiBtnAlt: { backgroundColor: theme.colors.cardAlt },
  aiBtnAltText: { color: theme.colors.text, fontWeight: '700' },
  pickRow: { flexDirection: 'row', gap: 8 },
  enrichBtn: { marginTop: 6, alignSelf: 'flex-start', paddingVertical: 4 },
  enrichText: { color: theme.colors.accent, fontWeight: '600', fontSize: theme.font.small },
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
