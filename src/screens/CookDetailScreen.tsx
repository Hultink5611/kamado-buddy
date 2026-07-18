import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, Image, TextInput } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../App';
import { getCook, deleteCook, saveCook, listMarinades } from '../storage/db';
import type { Cook, Marinade } from '../logic/types';
import LiveChart from '../components/LiveChart';
import PickerSheet from '../components/PickerSheet';
import { theme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'CookDetail'>;

export default function CookDetailScreen({ route, navigation }: Props) {
  const [cook, setCook] = useState<Cook | null>(null);
  const [notes, setNotes] = useState('');
  const [marinades, setMarinades] = useState<Marinade[]>([]);

  useEffect(() => {
    getCook(route.params.cookId).then((c) => {
      setCook(c);
      setNotes(c?.notes ?? '');
    });
    listMarinades().then(setMarinades);
  }, [route.params.cookId]);

  if (!cook) return <View style={styles.center}><Text style={styles.dim}>Laden…</Text></View>;

  const cutMarinades = marinades.filter((m) => m.meatId === cook.input.meatId);
  const setMarinade = async (id: string | undefined) => {
    const m = marinades.find((x) => x.id === id);
    const updated = { ...cook, input: { ...cook.input, marinadeId: id, marinadeName: m?.name } };
    await saveCook(updated);
    setCook(updated);
  };

  // Save the note; keeps every other field (incl. the cook's date) intact.
  const saveNotes = async () => {
    const trimmed = notes.trim();
    if (trimmed === (cook.notes ?? '')) return;
    const updated = { ...cook, notes: trimmed || undefined };
    await saveCook(updated);
    setCook(updated);
  };

  const mins = cook.endedAt ? Math.round((cook.endedAt - cook.startedAt) / 60000) : 0;
  const peakMeat = Math.max(0, ...cook.samples.map((s) => s.meatC ?? 0));
  const peakAmbient = Math.max(0, ...cook.samples.map((s) => s.ambientC ?? 0));

  const addResultPhoto = async (fromCamera: boolean) => {
    const res = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.6 })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.6 });
    if (res.canceled || !res.assets[0]) return;
    let uri = res.assets[0].uri;
    // Copy into persistent app storage so the photo survives cache clears.
    try {
      const dest = `${FileSystem.documentDirectory}result-${cook.id}.jpg`;
      await FileSystem.copyAsync({ from: uri, to: dest });
      uri = dest;
    } catch {
      /* fall back to the original uri */
    }
    const updated = { ...cook, resultPhotoUri: uri };
    await saveCook(updated);
    setCook(updated);
  };

  const choosePhoto = () =>
    Alert.alert('Resultaat-foto', 'Waar wil je de foto vandaan halen?', [
      { text: 'Camera', onPress: () => void addResultPhoto(true) },
      { text: 'Galerij', onPress: () => void addResultPhoto(false) },
      { text: 'Annuleer', style: 'cancel' },
    ]);

  const remove = () =>
    Alert.alert('Verwijderen?', 'Deze cook uit je logboek verwijderen.', [
      { text: 'Annuleer' },
      {
        text: 'Verwijder',
        style: 'destructive',
        onPress: async () => {
          await deleteCook(cook.id);
          navigation.goBack();
        },
      },
    ]);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>{cook.meatName}</Text>
      <Text style={styles.dim}>
        {new Date(cook.startedAt).toLocaleString('nl-NL')} · {mins} min
      </Text>

      <LiveChart samples={cook.samples} targetDomeC={cook.targetDomeC} targetCoreC={cook.targetCoreC} />

      <View style={styles.stats}>
        <Stat label="Doel kern" value={cook.targetCoreC != null ? `${cook.targetCoreC}°` : '–'} />
        <Stat label="Piek kern" value={`${Math.round(peakMeat)}°`} />
        <Stat label="Doel BBQ" value={`${cook.targetDomeC}°`} />
        <Stat label="Piek BBQ" value={`${Math.round(peakAmbient)}°`} />
      </View>

      {cook.input.frozen && <Text style={styles.dim}>❄️ Uit de diepvries gestart</Text>}

      <View style={styles.notesBlock}>
        <Text style={styles.photoH}>🧂 Marinade</Text>
        {cutMarinades.length > 0 ? (
          <PickerSheet
            title={`Marinades voor ${cook.meatName}`}
            options={cutMarinades.map((m) => ({ id: m.id, label: m.name || 'Naamloos', sub: m.rating != null ? `${m.rating}/10` : undefined, emoji: '🧂' }))}
            value={cook.input.marinadeId}
            placeholder="Geen marinade"
            noneLabel="Geen marinade"
            onSelect={setMarinade}
          />
        ) : (
          <Text style={styles.dim}>{cook.input.marinadeName ? `🧂 ${cook.input.marinadeName}` : 'Nog geen marinades voor dit stuk — voeg ze toe in de Marinades-tab.'}</Text>
        )}
      </View>

      <View style={styles.notesBlock}>
        <Text style={styles.photoH}>📝 Opmerkingen</Text>
        <TextInput
          style={styles.notes}
          value={notes}
          onChangeText={setNotes}
          onBlur={saveNotes}
          multiline
          placeholder="Hoe ging 't? Wat de volgende keer anders? Rub, hout, gasten…"
          placeholderTextColor={theme.colors.textDim}
        />
        <Text style={styles.photoHint}>Wordt automatisch opgeslagen.</Text>
      </View>

      <View style={styles.photoBlock}>
        <Text style={styles.photoH}>📸 Eindresultaat</Text>
        {cook.resultPhotoUri ? (
          <Pressable onPress={choosePhoto}>
            <Image source={{ uri: cook.resultPhotoUri }} style={styles.photo} />
            <Text style={styles.photoHint}>Tik om te vervangen</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.photoBtn} onPress={choosePhoto}>
            <Text style={styles.photoBtnText}>📷 Foto toevoegen</Text>
          </Pressable>
        )}
      </View>

      <Pressable style={styles.del} onPress={remove}>
        <Text style={styles.delText}>Verwijderen</Text>
      </Pressable>
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: theme.space(4), gap: theme.space(4) },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { color: theme.colors.text, fontSize: theme.font.h1, fontWeight: '700' },
  dim: { color: theme.colors.textDim, fontSize: theme.font.small },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space(3) },
  stat: { flexBasis: '47%', backgroundColor: theme.colors.card, borderRadius: 12, padding: theme.space(3) },
  statLabel: { color: theme.colors.textDim, fontSize: theme.font.small },
  statValue: { color: theme.colors.text, fontSize: theme.font.h2, fontWeight: '700', marginTop: 2 },
  del: { paddingVertical: 12, alignItems: 'center' },
  delText: { color: theme.colors.danger, fontWeight: '600' },
  notesBlock: { gap: theme.space(2) },
  notes: { backgroundColor: theme.colors.card, borderRadius: theme.radius, padding: theme.space(3), color: theme.colors.text, minHeight: 90, textAlignVertical: 'top', fontSize: theme.font.body },
  photoBlock: { gap: theme.space(2) },
  photoH: { color: theme.colors.text, fontSize: theme.font.h2, fontWeight: '700' },
  photo: { width: '100%', height: 240, borderRadius: theme.radius, backgroundColor: theme.colors.card },
  photoHint: { color: theme.colors.textDim, fontSize: theme.font.small, textAlign: 'center', marginTop: 6 },
  photoBtn: { backgroundColor: theme.colors.card, borderRadius: theme.radius, paddingVertical: theme.space(6), alignItems: 'center' },
  photoBtnText: { color: theme.colors.textDim, fontSize: theme.font.body },
});
