import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Alert } from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../App';
import { useApp } from '../state/AppContext';
import { getMeat, resolveTargetCore, estimateCookMinutes, predictMinutesRemaining } from '../logic/cook';
import { getSteeringAdvice } from '../logic/steering';
import { getLearnedForTarget, isStable, upsertLearned } from '../logic/learning';
import { fireAlarm, showCookStatus, clearCookStatus } from '../logic/notifications';
import { saveCook, saveLearned } from '../storage/db';
import type { Cook, TempSample } from '../logic/types';
import TempTile from '../components/TempTile';
import LiveChart from '../components/LiveChart';
import VentAdvice from '../components/VentAdvice';
import Timers from '../components/Timers';
import { theme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Cook'>;

const SAMPLE_MS = 5000;

export default function CookScreen({ route, navigation }: Props) {
  useKeepAwake();
  const { ink, settings, learned, reloadLearned } = useApp();
  const { input } = route.params;
  const meat = getMeat(input.meatId)!;
  const targetCoreC = resolveTargetCore(meat, input.doneness);
  const targetDomeC = meat.domeTempC;

  const [startedAt] = useState(Date.now());
  const [samples, setSamples] = useState<TempSample[]>([]);
  const [manualAmbient, setManualAmbient] = useState('');
  const [manualMeat, setManualMeat] = useState('');
  const [ambientCh, setAmbientCh] = useState(settings.ambientChannel);
  const [meatCh, setMeatCh] = useState(settings.meatChannel);

  const firedCore = useRef(false);
  const ambientOut = useRef(false);
  const appliedVent = useRef({ bottom: 0.5, top: 0.5 });
  const learnedFired = useRef(false);

  const estimateMin = useMemo(() => estimateCookMinutes(meat, input), [meat, input]);

  const currentAmbient = ink.channels[ambientCh] ?? (manualAmbient ? parseFloat(manualAmbient) : null);
  const currentMeat = ink.channels[meatCh] ?? (manualMeat ? parseFloat(manualMeat) : null);

  // Sampling loop
  useEffect(() => {
    const id = setInterval(() => {
      setSamples((prev) => [
        ...prev,
        { t: Date.now(), ambientC: currentAmbient, meatC: currentMeat },
      ].slice(-720)); // ~1h at 5s
    }, SAMPLE_MS);
    return () => clearInterval(id);
  }, [currentAmbient, currentMeat]);

  // Status notification
  useEffect(() => {
    void showCookStatus(
      `${meat.emoji} ${meat.name} · BBQ ${currentAmbient ? Math.round(currentAmbient) : '–'}° · kern ${
        currentMeat ? Math.round(currentMeat) : '–'
      }°`
    );
  }, [currentAmbient, currentMeat, meat]);

  useEffect(() => () => void clearCookStatus(), []);

  const learnedSetting = getLearnedForTarget(learned, targetDomeC);
  const advice = useMemo(
    () => getSteeringAdvice(targetDomeC, currentAmbient, samples, learnedSetting),
    [targetDomeC, currentAmbient, samples, learnedSetting]
  );
  appliedVent.current = { bottom: advice.suggestedBottom, top: advice.suggestedTop };

  // Alarms
  useEffect(() => {
    if (!firedCore.current && targetCoreC != null && currentMeat != null && currentMeat >= targetCoreC) {
      firedCore.current = true;
      void fireAlarm('✅ Kerntemp bereikt!', `${meat.name} zit op ${Math.round(currentMeat)}°C. Haal 'm eraf en laat rusten (${meat.restMin} min).`);
    }
  }, [currentMeat, targetCoreC, meat]);

  useEffect(() => {
    if (currentAmbient == null) return;
    const off = Math.abs(currentAmbient - targetDomeC) > settings.alarmMarginC;
    if (off && !ambientOut.current) {
      ambientOut.current = true;
      void fireAlarm('🌡️ BBQ buiten bereik', `Omgeving ${Math.round(currentAmbient)}°C (doel ${targetDomeC}°C). ${advice.detail}`);
    } else if (!off) {
      ambientOut.current = false;
    }
  }, [currentAmbient, targetDomeC, settings.alarmMarginC, advice.detail]);

  // Passive learning: when stable, remember the vent setting for this band.
  useEffect(() => {
    if (learnedFired.current || currentAmbient == null) return;
    if (isStable(samples, targetDomeC)) {
      learnedFired.current = true;
      const next = upsertLearned(learned, targetDomeC, appliedVent.current.bottom, appliedVent.current.top, currentAmbient, Date.now());
      void saveLearned(next).then(reloadLearned);
    }
  }, [samples, targetDomeC, currentAmbient, learned, reloadLearned]);

  const remaining = predictMinutesRemaining(samples, targetCoreC);

  const finish = useCallback(async () => {
    const cook: Cook = {
      id: `${startedAt}`,
      startedAt,
      endedAt: Date.now(),
      input,
      meatName: meat.name,
      targetCoreC,
      targetDomeC,
      ambientChannel: ambientCh,
      meatChannel: meatCh,
      samples,
    };
    await saveCook(cook);
    await clearCookStatus();
    navigation.replace('CookDetail', { cookId: cook.id });
  }, [startedAt, input, meat, targetCoreC, targetDomeC, ambientCh, meatCh, samples, navigation]);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>{meat.emoji} {meat.name}</Text>
        <Text style={styles.sub}>
          Schatting ~{estimateMin} min{remaining != null ? ` · nog ~${remaining} min` : ''}
        </Text>
      </View>

      <View style={styles.tiles}>
        <TempTile label="🌡️ BBQ (omgeving)" valueC={currentAmbient} targetC={targetDomeC} color={theme.colors.ambient} />
        <TempTile label="🥩 Vlees (kern)" valueC={currentMeat} targetC={targetCoreC} color={theme.colors.meat} />
      </View>

      <LiveChart samples={samples} targetDomeC={targetDomeC} targetCoreC={targetCoreC} />

      <VentAdvice advice={advice} />

      <Timers startedAt={startedAt} flipIntervalMin={meat.flipIntervalMin} />

      {ink.state !== 'connected' && (
        <View style={styles.manual}>
          <Text style={styles.manualH}>Handmatig invoeren (geen meter verbonden)</Text>
          <View style={styles.row}>
            <TextInput style={styles.mInput} keyboardType="numeric" placeholder="BBQ °C" placeholderTextColor={theme.colors.textDim} value={manualAmbient} onChangeText={setManualAmbient} />
            <TextInput style={styles.mInput} keyboardType="numeric" placeholder="Vlees °C" placeholderTextColor={theme.colors.textDim} value={manualMeat} onChangeText={setManualMeat} />
          </View>
        </View>
      )}

      {ink.state === 'connected' && ink.channels.length > 1 && (
        <View style={styles.manual}>
          <Text style={styles.manualH}>Kanaal-toewijzing</Text>
          <ChannelPicker label="Omgeving" channels={ink.channels} value={ambientCh} onChange={setAmbientCh} />
          <ChannelPicker label="Vlees" channels={ink.channels} value={meatCh} onChange={setMeatCh} />
        </View>
      )}

      <Pressable style={styles.finish} onPress={() => Alert.alert('Cook afronden?', 'Opslaan in logboek en stoppen.', [{ text: 'Annuleer' }, { text: 'Afronden', onPress: finish }])}>
        <Text style={styles.finishText}>Cook afronden</Text>
      </Pressable>
    </ScrollView>
  );
}

function ChannelPicker({ label, channels, value, onChange }: { label: string; channels: (number | null)[]; value: number; onChange: (n: number) => void }) {
  return (
    <View style={styles.pickRow}>
      <Text style={styles.pickLabel}>{label}</Text>
      <View style={styles.row}>
        {channels.map((c, i) => (
          <Pressable key={i} style={[styles.chBtn, value === i && styles.chBtnSel]} onPress={() => onChange(i)}>
            <Text style={[styles.chText, value === i && { color: '#0d0f12' }]}>P{i + 1} {c == null ? '' : `${Math.round(c)}°`}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: theme.space(4), gap: theme.space(4) },
  header: { gap: 2 },
  title: { color: theme.colors.text, fontSize: theme.font.h1, fontWeight: '700' },
  sub: { color: theme.colors.textDim, fontSize: theme.font.body },
  tiles: { flexDirection: 'row', gap: theme.space(3) },
  manual: { backgroundColor: theme.colors.card, borderRadius: theme.radius, padding: theme.space(4), gap: theme.space(2) },
  manualH: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '600' },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  mInput: { flex: 1, backgroundColor: theme.colors.cardAlt, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: theme.colors.text },
  pickRow: { gap: 6, marginTop: 4 },
  pickLabel: { color: theme.colors.textDim, fontSize: theme.font.small },
  chBtn: { backgroundColor: theme.colors.cardAlt, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10 },
  chBtnSel: { backgroundColor: theme.colors.accent },
  chText: { color: theme.colors.text, fontSize: theme.font.small },
  finish: { backgroundColor: theme.colors.cardAlt, borderRadius: theme.radius, paddingVertical: 14, alignItems: 'center' },
  finishText: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
});
