import React, { useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Alert } from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../App';
import { useApp } from '../state/AppContext';
import { getMeat, resolveTargetCore, estimateCookMinutes, predictMinutesRemaining } from '../logic/cook';
import { getSteeringAdvice } from '../logic/steering';
import { getLearnedForTarget } from '../logic/learning';
import TempTile from '../components/TempTile';
import LiveChart from '../components/LiveChart';
import VentAdvice from '../components/VentAdvice';
import Timers from '../components/Timers';
import { theme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Cook'>;

export default function CookScreen({ navigation }: Props) {
  useKeepAwake();
  const { ink, learned, activeCook, updateActiveCook, finishCook } = useApp();
  const ac = activeCook;

  const meat = ac ? getMeat(ac.input.meatId) : undefined;
  const targetCoreC = meat && ac ? resolveTargetCore(meat, ac.input.doneness) : null;
  const targetDomeC = meat?.domeTempC ?? 0;
  const samples = ac?.samples ?? [];

  const currentAmbient = ac
    ? ink.channels[ac.ambientCh] ?? (ac.manualAmbient ? parseFloat(ac.manualAmbient) : null)
    : null;
  const currentMeat = ac
    ? ink.channels[ac.meatCh] ?? (ac.manualMeat ? parseFloat(ac.manualMeat) : null)
    : null;

  const estimateMin = useMemo(
    () => (meat && ac ? estimateCookMinutes(meat, ac.input) : 0),
    [meat, ac]
  );

  const learnedSetting = getLearnedForTarget(learned, targetDomeC);
  const advice = useMemo(
    () => getSteeringAdvice(targetDomeC, currentAmbient, samples, learnedSetting),
    [targetDomeC, currentAmbient, samples, learnedSetting]
  );

  const remaining = predictMinutesRemaining(samples, targetCoreC);

  const finish = useCallback(async () => {
    const id = await finishCook();
    if (id) navigation.replace('CookDetail', { cookId: id });
  }, [finishCook, navigation]);

  if (!ac || !meat) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Geen actieve cook.</Text>
        <Pressable style={styles.finish} onPress={() => navigation.replace('Home')}>
          <Text style={styles.finishText}>Naar start</Text>
        </Pressable>
      </View>
    );
  }

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

      <Timers
        startedAt={ac.startedAt}
        flipIntervalMin={meat.flipIntervalMin}
        lastFlipAt={ac.lastFlipAt ?? ac.startedAt}
        onFlipReset={() => updateActiveCook({ lastFlipAt: Date.now() })}
      />

      {ink.state !== 'connected' && (
        <View style={styles.manual}>
          <Text style={styles.manualH}>Handmatig invoeren (geen meter verbonden)</Text>
          <View style={styles.row}>
            <TextInput style={styles.mInput} keyboardType="numeric" placeholder="BBQ °C" placeholderTextColor={theme.colors.textDim} value={ac.manualAmbient} onChangeText={(v) => updateActiveCook({ manualAmbient: v })} />
            <TextInput style={styles.mInput} keyboardType="numeric" placeholder="Vlees °C" placeholderTextColor={theme.colors.textDim} value={ac.manualMeat} onChangeText={(v) => updateActiveCook({ manualMeat: v })} />
          </View>
        </View>
      )}

      {ink.state === 'connected' && ink.channels.length > 1 && (
        <View style={styles.manual}>
          <Text style={styles.manualH}>Kanaal-toewijzing</Text>
          <ChannelPicker label="Omgeving" channels={ink.channels} value={ac.ambientCh} onChange={(n) => updateActiveCook({ ambientCh: n })} />
          <ChannelPicker label="Vlees" channels={ink.channels} value={ac.meatCh} onChange={(n) => updateActiveCook({ meatCh: n })} />
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
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.space(4), padding: theme.space(4) },
  emptyText: { color: theme.colors.textDim, fontSize: theme.font.body },
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
  finish: { backgroundColor: theme.colors.cardAlt, borderRadius: theme.radius, paddingVertical: 14, alignItems: 'center', paddingHorizontal: theme.space(6) },
  finishText: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
});
