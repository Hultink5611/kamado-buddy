import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, RefreshControl, Alert, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { MainTabParamList, RootStackParamList } from '../App';
import { useApp } from '../state/AppContext';
import { getMeat } from '../logic/cook';
import { listCooks } from '../storage/db';
import type { Cook } from '../logic/types';
import { checkAndApplyUpdate } from '../logic/otaUpdate';
import { theme } from '../theme';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Home'>,
  NativeStackScreenProps<RootStackParamList>
>;

export default function HomeScreen({ navigation }: Props) {
  const { ink, activeCook } = useApp();
  const connected = ink.state === 'connected';
  const [refreshing, setRefreshing] = useState(false);
  const [recent, setRecent] = useState<Cook[]>([]);

  useFocusEffect(
    useCallback(() => {
      listCooks().then((all) => setRecent(all.slice(0, 3)));
    }, [])
  );

  // Swipe omlaag = check op een nieuwe OTA-update en herlaad indien beschikbaar.
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    const result = await checkAndApplyUpdate();
    setRefreshing(false);
    if (result === 'up-to-date') Alert.alert('Up-to-date', 'Je hebt al de nieuwste versie.');
    else if (result === 'unavailable') Alert.alert('Niet beschikbaar', 'Updates werken alleen in een geïnstalleerde build.');
    else if (result === 'error') Alert.alert('Mislukt', 'Kon niet naar updates zoeken. Check je internet.');
    // 'updated' → de app herlaadt zelf in de nieuwe versie.
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.textDim}
            colors={[theme.colors.accent]}
          />
        }
      >
        {activeCook && (
          <Pressable style={styles.cookBanner} onPress={() => navigation.navigate('Cook')}>
            <Text style={styles.cookBannerText}>
              🔥 Grill actief{(() => { const m = getMeat(activeCook.input.meatId); return m ? ` — ${m.emoji} ${m.name}` : ''; })()}
            </Text>
            <Text style={styles.cookBannerSub}>Tik om terug te gaan naar het live-scherm</Text>
          </Pressable>
        )}

        <View style={[styles.status, { borderColor: connected ? theme.colors.target : theme.colors.line }]}>
          <View style={styles.statusRow}>
            <View
              style={[
                styles.dot,
                { backgroundColor: connected ? theme.colors.target : theme.colors.textDim },
              ]}
            />
            <Text style={styles.statusText}>
              {ink.state === 'connected'
                ? `Verbonden met ${ink.deviceName ?? 'Inkbird'}`
                : ink.state === 'scanning'
                ? 'Zoeken naar meter…'
                : ink.state === 'connecting'
                ? 'Verbinden…'
                : 'Niet verbonden'}
            </Text>
          </View>
          {ink.error && <Text style={styles.err}>{ink.error}</Text>}
          {connected ? (
            <View style={styles.channels}>
              {ink.channels.map((c, i) => (
                <Text key={i} style={styles.chan}>
                  P{i + 1}: {c == null ? '––' : `${Math.round(c)}°`}
                </Text>
              ))}
            </View>
          ) : (
            <Pressable style={styles.connectBtn} onPress={ink.scanAndConnect}>
              <Text style={styles.connectText}>
                {ink.state === 'scanning' || ink.state === 'connecting' ? 'Bezig…' : 'Verbind Inkbird'}
              </Text>
            </Pressable>
          )}
          {connected && (
            <Pressable onPress={ink.disconnect}>
              <Text style={styles.disc}>Verbreek verbinding</Text>
            </Pressable>
          )}
        </View>

        <Pressable style={styles.cta} onPress={() => navigation.navigate('NewCook')}>
          <Text style={styles.ctaEmoji}>🔥</Text>
          <Text style={styles.ctaText}>Grillen maar!</Text>
          <Text style={styles.ctaSub}>Kies je vlees en start</Text>
        </Pressable>

        {recent.length > 0 && (
          <View style={styles.recentBlock}>
            <View style={styles.recentHead}>
              <Text style={styles.recentTitle}>📓 Laatste grill-sessies</Text>
              <Pressable onPress={() => navigation.navigate('Logbook')}>
                <Text style={styles.recentLink}>Volledig logboek ›</Text>
              </Pressable>
            </View>
            {recent.map((c) => {
              const mins = c.endedAt ? Math.round((c.endedAt - c.startedAt) / 60000) : 0;
              return (
                <Pressable key={c.id} style={styles.recentRow} onPress={() => navigation.navigate('CookDetail', { cookId: c.id })}>
                  {c.resultPhotoUri ? (
                    <Image source={{ uri: c.resultPhotoUri }} style={styles.recentThumb} />
                  ) : (
                    <Text style={styles.recentEmoji}>🍖</Text>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.recentName}>
                      {c.meatName}{c.input.marinadeName ? ` · 🧂 ${c.input.marinadeName}` : ''}
                    </Text>
                    <Text style={styles.recentMeta}>
                      {new Date(c.startedAt).toLocaleDateString('nl-NL')} · {mins} min
                    </Text>
                  </View>
                  <Text style={styles.recentChev}>›</Text>
                </Pressable>
              );
            })}
          </View>
        )}

        <Text style={styles.hint}>
          Tip: sluit de originele Inkbird-app voor je verbindt — er kan maar één app tegelijk met de meter praten. ↓ Swipe omlaag om de app bij te werken.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.space(4), gap: theme.space(4) },
  cookBanner: { backgroundColor: theme.colors.accent, borderRadius: theme.radius, padding: theme.space(4), gap: 2 },
  cookBannerText: { color: '#0d0f12', fontSize: theme.font.body, fontWeight: '700' },
  cookBannerSub: { color: '#0d0f12', fontSize: theme.font.small, opacity: 0.8 },
  status: { backgroundColor: theme.colors.card, borderRadius: theme.radius, borderWidth: 1, padding: theme.space(4), gap: theme.space(3) },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  statusText: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '600' },
  err: { color: theme.colors.danger, fontSize: theme.font.small },
  channels: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  chan: { color: theme.colors.textDim, fontSize: theme.font.body },
  connectBtn: { backgroundColor: theme.colors.accent, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  connectText: { color: '#0d0f12', fontWeight: '700', fontSize: theme.font.body },
  disc: { color: theme.colors.textDim, fontSize: theme.font.small, textAlign: 'center' },
  cta: { backgroundColor: theme.colors.accent, borderRadius: theme.radius, padding: theme.space(6), alignItems: 'center', gap: 4 },
  ctaEmoji: { fontSize: 40 },
  ctaText: { color: '#0d0f12', fontSize: theme.font.h1, fontWeight: '800' },
  ctaSub: { color: '#0d0f12', fontSize: theme.font.small, opacity: 0.8 },
  hint: { color: theme.colors.textDim, fontSize: theme.font.small, lineHeight: 19 },
  recentBlock: { gap: theme.space(2) },
  recentHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  recentTitle: { color: theme.colors.text, fontSize: theme.font.h2, fontWeight: '700' },
  recentLink: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '600' },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.colors.card, borderRadius: theme.radius, padding: theme.space(3) },
  recentThumb: { width: 44, height: 44, borderRadius: 8, backgroundColor: theme.colors.cardAlt },
  recentEmoji: { fontSize: 24, width: 44, textAlign: 'center' },
  recentName: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '600' },
  recentMeta: { color: theme.colors.textDim, fontSize: theme.font.small, marginTop: 2 },
  recentChev: { color: theme.colors.textDim, fontSize: 22 },
});
