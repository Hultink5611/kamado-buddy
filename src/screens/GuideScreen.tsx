import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Alert, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useApp } from '../state/AppContext';
import { identifyCutName } from '../ai/steerAI';
import guideData from '../data/tempGuide.json';
import { theme } from '../theme';

interface GuideLevel {
  label: string;
  c: string | null;
  note?: string;
}
interface GuideItem {
  id: string;
  name: string;
  aliases: string[];
  category: string;
  emoji: string;
  headC: string;
  safeC: number | null;
  practice: GuideLevel[];
  method: string;
}

const ITEMS: GuideItem[] = (guideData as { items: GuideItem[] }).items;
const CATEGORIES = ['Alle', 'Rund', 'Varken', 'Gevogelte', 'Lam', 'Wild', 'Vis', 'Overig'];

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/** Match a free-text query (or AI photo guess) against name + aliases. */
function matchItem(query: string): GuideItem | undefined {
  const q = norm(query);
  if (!q) return undefined;
  return (
    ITEMS.find((i) => norm(i.name) === q || i.aliases.some((a) => norm(a) === q)) ??
    ITEMS.find((i) => norm(i.name).includes(q) || i.aliases.some((a) => norm(a).includes(q) || q.includes(norm(a))))
  );
}

export default function GuideScreen() {
  const { settings } = useApp();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Alle');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [scanBusy, setScanBusy] = useState(false);

  const shown = useMemo(() => {
    const q = norm(query);
    return ITEMS.filter((i) => {
      if (category !== 'Alle' && i.category !== category) return false;
      if (!q) return true;
      return norm(i.name).includes(q) || i.aliases.some((a) => norm(a).includes(q));
    });
  }, [query, category]);

  const scanPhoto = async () => {
    if (!settings.keys.openaiKey && !settings.keys.geminiKey) {
      Alert.alert('Geen AI-sleutel', 'Fotoherkenning vereist een OpenAI- of Gemini-sleutel (Instellingen).');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.7 });
    if (res.canceled || !res.assets[0]?.base64) return;
    setScanBusy(true);
    try {
      const guess = await identifyCutName(settings.keys, res.assets[0].base64);
      const hit = matchItem(guess);
      if (hit) {
        setCategory('Alle');
        setQuery(hit.name);
        setExpanded(hit.id);
      } else {
        setQuery(guess);
        Alert.alert('Herkend als', `"${guess}" — staat (nog) niet in de gids. Probeer een zoekterm of vraag 'm aan.`);
      }
    } catch (e) {
      Alert.alert('Scan mislukt', String(e));
    } finally {
      setScanBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.searchRow}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          value={query}
          onChangeText={setQuery}
          placeholder="Zoek: bavette, kipdij, zalm…"
          placeholderTextColor={theme.colors.textDim}
          autoCorrect={false}
        />
        <Pressable style={styles.scanBtn} onPress={scanPhoto} disabled={scanBusy}>
          {scanBusy ? <ActivityIndicator color="#0d0f12" /> : <Text style={styles.scanText}>📷</Text>}
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cats}>
        {CATEGORIES.map((c) => (
          <Pressable key={c} style={[styles.cat, category === c && styles.catSel]} onPress={() => setCategory(c)}>
            <Text style={[styles.catText, category === c && { color: '#0d0f12' }]}>{c}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {shown.length === 0 && (
        <Text style={styles.empty}>Niets gevonden voor “{query}”. Probeer een andere naam (bijv. “flanksteak” i.p.v. “bavette”).</Text>
      )}

      {shown.map((item) => {
        const open = expanded === item.id;
        return (
          <Pressable key={item.id} style={styles.card} onPress={() => setExpanded(open ? null : item.id)}>
            <View style={styles.cardHead}>
              <Text style={styles.cardEmoji}>{item.emoji}</Text>
              <View style={styles.cardMid}>
                <Text style={styles.cardName}>{item.name}</Text>
                <Text style={styles.cardCat}>{item.category}</Text>
              </View>
              <View style={styles.tempBadge}>
                <Text style={styles.tempBadgeText}>{item.headC}</Text>
              </View>
              <Text style={styles.chev}>{open ? '▾' : '›'}</Text>
            </View>

            {open && (
              <View style={styles.detail}>
                {item.practice.map((lvl, i) => (
                  <View key={i} style={styles.lvlRow}>
                    <Text style={styles.lvlLabel}>{lvl.label}</Text>
                    <Text style={styles.lvlTemp}>{lvl.c != null ? `${lvl.c}°C` : '—'}</Text>
                  </View>
                ))}
                {item.practice.some((l) => l.note) && (
                  <View style={{ gap: 2 }}>
                    {item.practice
                      .filter((l) => l.note)
                      .map((l, i) => (
                        <Text key={i} style={styles.lvlNote}>· {l.label}: {l.note}</Text>
                      ))}
                  </View>
                )}
                {item.safeC != null && (
                  <Text style={styles.safe}>🛡️ Officieel veilig minimum (USDA): {item.safeC}°C</Text>
                )}
                <Text style={styles.methodH}>🔥 Zo pak je 't aan</Text>
                <Text style={styles.method}>{item.method}</Text>
              </View>
            )}
          </Pressable>
        );
      })}

      <Text style={styles.sources}>
        Bronnen: USDA/FSIS (veilige minima) · AmazingRibs & Weber (BBQ-praktijk). Waarden waar praktijk en officieel minimum verschillen staan beide vermeld.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: theme.space(4), gap: theme.space(3) },
  searchRow: { flexDirection: 'row', gap: 8 },
  input: { backgroundColor: theme.colors.card, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: theme.colors.text, fontSize: theme.font.body },
  scanBtn: { backgroundColor: theme.colors.accent, borderRadius: 12, width: 50, alignItems: 'center', justifyContent: 'center' },
  scanText: { fontSize: 22 },
  cats: { gap: 8, paddingVertical: 2 },
  cat: { backgroundColor: theme.colors.card, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  catSel: { backgroundColor: theme.colors.accent },
  catText: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '600' },
  empty: { color: theme.colors.textDim, textAlign: 'center', padding: theme.space(4) },
  card: { backgroundColor: theme.colors.card, borderRadius: theme.radius, padding: theme.space(3) },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardEmoji: { fontSize: 24 },
  cardMid: { flex: 1, gap: 1 },
  cardName: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '600' },
  cardCat: { color: theme.colors.textDim, fontSize: 11 },
  tempBadge: { backgroundColor: theme.colors.cardAlt, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  tempBadgeText: { color: theme.colors.accent, fontWeight: '800', fontSize: theme.font.body },
  chev: { color: theme.colors.textDim, fontSize: 18, marginLeft: 2 },
  detail: { marginTop: theme.space(3), gap: theme.space(2), borderTopWidth: 1, borderTopColor: theme.colors.line, paddingTop: theme.space(3) },
  lvlRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  lvlLabel: { color: theme.colors.text, fontSize: theme.font.small },
  lvlTemp: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '700' },
  lvlNote: { color: theme.colors.textDim, fontSize: 11, lineHeight: 16 },
  safe: { color: theme.colors.textDim, fontSize: theme.font.small },
  methodH: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700', marginTop: 2 },
  method: { color: theme.colors.textDim, fontSize: theme.font.small, lineHeight: 20 },
  sources: { color: theme.colors.textDim, fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: theme.space(2) },
});
