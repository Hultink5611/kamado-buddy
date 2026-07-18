import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, Switch, Image, ActivityIndicator, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../App';
import { getMeat, resolveTargetCore } from '../logic/cook';
import { identifyMeat } from '../ai/steerAI';
import { useApp } from '../state/AppContext';
import { listMarinades } from '../storage/db';
import type { Marinade } from '../logic/types';
import PickerSheet from '../components/PickerSheet';
import { theme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'NewCook'>;

export default function NewCookScreen({ navigation }: Props) {
  const { settings, startCook, meats, saveMeat } = useApp();
  const [meatId, setMeatId] = useState<string | null>(null);
  const [doneness, setDoneness] = useState<string | undefined>();
  const [frozen, setFrozen] = useState(false);
  const [weight, setWeight] = useState('');
  const [thickness, setThickness] = useState('');
  const [photoUri, setPhotoUri] = useState<string | undefined>();
  const [aiBusy, setAiBusy] = useState(false);
  const [marinades, setMarinades] = useState<Marinade[]>([]);
  const [marinadeId, setMarinadeId] = useState<string | undefined>();
  const [marinadeName, setMarinadeName] = useState<string | undefined>();

  const meat = meatId ? getMeat(meatId) : undefined;
  const useWeight = meat?.estimate.type === 'weight';
  const targetCore = meat ? resolveTargetCore(meat, doneness) : null;

  useEffect(() => {
    listMarinades().then(setMarinades);
  }, []);
  // Reset the marinade choice whenever the cut changes.
  useEffect(() => {
    setMarinadeId(undefined);
    setMarinadeName(undefined);
  }, [meatId]);
  const cutMarinades = meatId ? marinades.filter((m) => m.meatId === meatId) : [];

  const pickPhoto = async () => {
    const res = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.7 });
    if (res.canceled || !res.assets[0]) return;
    const asset = res.assets[0];
    setPhotoUri(asset.uri);
    if (!settings.keys.openaiKey && !settings.keys.geminiKey) {
      Alert.alert('Geen AI-sleutel', 'Stel een OpenAI- of Gemini-sleutel in bij Instellingen om foto’s te laten herkennen. De foto is bewaard in je logboek.');
      return;
    }
    if (!asset.base64) return;
    setAiBusy(true);
    try {
      const guess = await identifyMeat(settings.keys, meats, asset.base64);
      if (guess.newMeat) {
        // AI ontdekte een stuk dat nog niet in de lijst staat → automatisch toevoegen.
        await saveMeat(guess.newMeat);
        setMeatId(guess.newMeat.id);
        setDoneness(undefined);
        Alert.alert('Nieuw stuk ontdekt! 🎉', `Ik heb "${guess.newMeat.name}" niet in je lijst gevonden en het automatisch toegevoegd.\n\n${guess.notes}`);
      } else if (guess.meatId) {
        setMeatId(guess.meatId);
        setDoneness(undefined);
        Alert.alert('AI-suggestie', `${guess.name}\n\n${guess.notes}`);
      } else {
        Alert.alert('AI-suggestie', `${guess.name}\n\n${guess.notes}`);
      }
    } catch (e) {
      Alert.alert('AI mislukt', String(e));
    } finally {
      setAiBusy(false);
    }
  };

  const start = () => {
    if (!meatId) return;
    startCook({
      meatId,
      doneness,
      frozen,
      weightKg: weight ? parseFloat(weight.replace(',', '.')) : undefined,
      thicknessCm: thickness ? parseFloat(thickness.replace(',', '.')) : undefined,
      photoUri,
      marinadeId,
      marinadeName,
    });
    navigation.replace('Cook');
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Pressable style={styles.photo} onPress={pickPhoto}>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={styles.photoImg} />
        ) : (
          <Text style={styles.photoText}>📷 Foto maken (optioneel, AI herkent 't vlees)</Text>
        )}
        {aiBusy && <ActivityIndicator style={StyleSheet.absoluteFill} color={theme.colors.accent} />}
      </Pressable>

      <View style={styles.hRow}>
        <Text style={styles.h}>Kies je vlees</Text>
        <Pressable onPress={() => navigation.navigate('MeatEdit')}>
          <Text style={styles.manageLink}>Beheren</Text>
        </Pressable>
      </View>
      <View style={styles.meatGrid}>
        {meats.map((m) => (
          <Pressable
            key={m.id}
            style={[styles.meatChip, meatId === m.id && styles.meatChipSel]}
            onPress={() => {
              setMeatId(m.id);
              setDoneness(undefined);
            }}
          >
            <Text style={styles.meatEmoji}>{m.emoji}</Text>
            <Text style={[styles.meatName, meatId === m.id && { color: '#0d0f12' }]}>{m.name}</Text>
          </Pressable>
        ))}
      </View>

      {meat && (
        <View style={styles.details}>
          <View style={styles.goals}>
            <View style={styles.goal}>
              <Text style={styles.goalLabel}>🔥 BBQ erop bij</Text>
              <Text style={styles.goalVal}>{meat.domeTempC}°C</Text>
            </View>
            <View style={styles.goal}>
              <Text style={styles.goalLabel}>🥩 Kern-doel</Text>
              <Text style={styles.goalVal}>{targetCore != null ? `${targetCore}°C` : 'op gevoel'}</Text>
            </View>
            <View style={styles.goal}>
              <Text style={styles.goalLabel}>⏲️ Temperen</Text>
              <Text style={styles.goalVal}>{meat.temperMin ?? 0} min</Text>
            </View>
          </View>
          <Text style={styles.tips}>{meat.tips}</Text>

          {meat.doneness && (
            <>
              <Text style={styles.label}>Gaarheid</Text>
              <View style={styles.row}>
                {Object.keys(meat.doneness).map((d) => (
                  <Pressable
                    key={d}
                    style={[styles.smallChip, doneness === d && styles.smallChipSel]}
                    onPress={() => setDoneness(d)}
                  >
                    <Text style={[styles.smallChipText, doneness === d && { color: '#0d0f12' }]}>
                      {d} ({meat.doneness![d]}°)
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          <View style={styles.inlineRow}>
            <Text style={styles.label}>Uit de diepvries</Text>
            <Switch value={frozen} onValueChange={setFrozen} trackColor={{ true: theme.colors.accent }} />
          </View>

          <Text style={styles.label}>{useWeight ? 'Gewicht (kg)' : 'Dikte (cm)'}</Text>
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            placeholder={useWeight ? `bijv. ${meat.typicalWeightKg ?? 1.5}` : 'bijv. 3'}
            placeholderTextColor={theme.colors.textDim}
            value={useWeight ? weight : thickness}
            onChangeText={useWeight ? setWeight : setThickness}
          />

          <Text style={styles.label}>Marinade (optioneel)</Text>
          {cutMarinades.length > 0 ? (
            <PickerSheet
              title={`Marinades voor ${meat.name}`}
              options={cutMarinades.map((m) => ({ id: m.id, label: m.name || 'Naamloos', sub: [m.amount, m.rating != null ? `${m.rating}/10` : null].filter(Boolean).join(' · ') || undefined, emoji: '🧂' }))}
              value={marinadeId}
              placeholder="Geen marinade"
              noneLabel="Geen marinade"
              onSelect={(id) => {
                setMarinadeId(id);
                setMarinadeName(cutMarinades.find((m) => m.id === id)?.name);
              }}
            />
          ) : (
            <Text style={styles.hintSmall}>Nog geen marinades voor {meat.name}. Voeg ze toe in de Marinades-tab.</Text>
          )}
        </View>
      )}

      <Pressable style={[styles.start, !meatId && styles.startDisabled]} disabled={!meatId} onPress={start}>
        <Text style={styles.startText}>Start cook 🔥</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: theme.space(4), gap: theme.space(4) },
  photo: { height: 120, backgroundColor: theme.colors.card, borderRadius: theme.radius, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  photoImg: { width: '100%', height: '100%' },
  photoText: { color: theme.colors.textDim },
  hRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  h: { color: theme.colors.text, fontSize: theme.font.h2, fontWeight: '700' },
  manageLink: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '600' },
  meatGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space(2) },
  meatChip: { backgroundColor: theme.colors.card, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6 },
  meatChipSel: { backgroundColor: theme.colors.accent },
  meatEmoji: { fontSize: 18 },
  meatName: { color: theme.colors.text, fontSize: theme.font.small },
  details: { backgroundColor: theme.colors.card, borderRadius: theme.radius, padding: theme.space(4), gap: theme.space(3) },
  goals: { flexDirection: 'row', gap: theme.space(2) },
  goal: { flex: 1, backgroundColor: theme.colors.cardAlt, borderRadius: 12, paddingVertical: theme.space(3), paddingHorizontal: theme.space(2), alignItems: 'center', gap: 2 },
  goalLabel: { color: theme.colors.textDim, fontSize: theme.font.small, textAlign: 'center' },
  goalVal: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  tips: { color: theme.colors.textDim, fontSize: theme.font.small, lineHeight: 20 },
  hintSmall: { color: theme.colors.textDim, fontSize: theme.font.small },
  label: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '600' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  inlineRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  smallChip: { backgroundColor: theme.colors.cardAlt, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10 },
  smallChipSel: { backgroundColor: theme.colors.accent },
  smallChipText: { color: theme.colors.text, fontSize: theme.font.small },
  input: { backgroundColor: theme.colors.cardAlt, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: theme.colors.text },
  start: { backgroundColor: theme.colors.accent, borderRadius: theme.radius, paddingVertical: 16, alignItems: 'center' },
  startDisabled: { opacity: 0.4 },
  startText: { color: '#0d0f12', fontSize: theme.font.h2, fontWeight: '700' },
});
