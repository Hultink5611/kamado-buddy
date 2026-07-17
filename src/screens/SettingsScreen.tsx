import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, Alert, Share } from 'react-native';
import { useApp } from '../state/AppContext';
import { exportAll } from '../storage/db';
import { testHA } from '../ha/haPush';
import { theme } from '../theme';

export default function SettingsScreen() {
  const { settings, updateSettings } = useApp();
  const [openai, setOpenai] = useState(settings.keys.openaiKey ?? '');
  const [gemini, setGemini] = useState(settings.keys.geminiKey ?? '');
  const [groq, setGroq] = useState(settings.keys.groqKey ?? '');
  const [margin, setMargin] = useState(String(settings.alarmMarginC));
  const [haUrl, setHaUrl] = useState(settings.ha.url ?? '');
  const [haToken, setHaToken] = useState(settings.ha.token ?? '');

  const saveHa = () =>
    updateSettings({ ha: { url: haUrl.trim() || undefined, token: haToken.trim() || undefined } }).then(() =>
      Alert.alert('Opgeslagen', 'Home Assistant-koppeling bijgewerkt.')
    );

  const testHa = async () => {
    const r = await testHA({ url: haUrl.trim() || undefined, token: haToken.trim() || undefined });
    Alert.alert(r.ok ? '✅ Verbonden' : '❌ Niet gelukt', r.detail);
  };

  const saveKeys = () =>
    updateSettings({
      keys: {
        openaiKey: openai.trim() || undefined,
        geminiKey: gemini.trim() || undefined,
        groqKey: groq.trim() || undefined,
      },
    }).then(() => Alert.alert('Opgeslagen', 'AI-sleutels bijgewerkt.'));

  const exportData = async () => {
    const json = await exportAll();
    await Share.share({ title: 'kamado-buddy-export.json', message: json });
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Section title="AI (optioneel)">
        <Text style={styles.hint}>
          Meerdere sleutels? Dan wordt de eerste die werkt gebruikt: OpenAI (GPT) → Gemini → Groq. Zo valt een Gemini-limiet (429) automatisch door naar GPT. De live temp-logica werkt altijd zonder AI.
        </Text>
        <Text style={styles.label}>OpenAI (GPT) API-sleutel</Text>
        <TextInput style={styles.input} value={openai} onChangeText={setOpenai} placeholder="sk-…" placeholderTextColor={theme.colors.textDim} autoCapitalize="none" autoCorrect={false} secureTextEntry />
        <Text style={styles.label}>Gemini API-sleutel</Text>
        <TextInput style={styles.input} value={gemini} onChangeText={setGemini} placeholder="AIza…" placeholderTextColor={theme.colors.textDim} autoCapitalize="none" autoCorrect={false} secureTextEntry />
        <Text style={styles.label}>Groq API-sleutel</Text>
        <TextInput style={styles.input} value={groq} onChangeText={setGroq} placeholder="gsk_…" placeholderTextColor={theme.colors.textDim} autoCapitalize="none" autoCorrect={false} secureTextEntry />
        <Pressable style={styles.btn} onPress={saveKeys}><Text style={styles.btnText}>Sleutels opslaan</Text></Pressable>
        <Text style={styles.hint}>Sleutels: platform.openai.com/api-keys (OpenAI) · aistudio.google.com/apikey (Gemini) · console.groq.com/keys (Groq)</Text>
      </Section>

      <Section title="Alarmen">
        <Text style={styles.label}>Marge kamado-alarm (± °C)</Text>
        <TextInput
          style={styles.input}
          value={margin}
          onChangeText={setMargin}
          keyboardType="numeric"
          onBlur={() => updateSettings({ alarmMarginC: parseInt(margin, 10) || 15 })}
        />
      </Section>

      <Section title="Thuishub (Home Assistant)">
        <Text style={styles.hint}>
          Stuurt live temps + klepadvies naar HA, zodat je BBQ-kaart op de Tab S11 verschijnt. Blijft lokaal op je telefoon, niet in git.
        </Text>
        <Text style={styles.label}>HA-URL</Text>
        <TextInput style={styles.input} value={haUrl} onChangeText={setHaUrl} placeholder="http://192.168.178.10:8123" placeholderTextColor={theme.colors.textDim} autoCapitalize="none" autoCorrect={false} />
        <Text style={styles.label}>Long-lived token</Text>
        <TextInput style={styles.input} value={haToken} onChangeText={setHaToken} placeholder="eyJ…" placeholderTextColor={theme.colors.textDim} autoCapitalize="none" autoCorrect={false} secureTextEntry />
        <Pressable style={styles.btn} onPress={saveHa}><Text style={styles.btnText}>HA-koppeling opslaan</Text></Pressable>
        <Pressable style={[styles.btn, styles.btnAlt]} onPress={testHa}><Text style={styles.btnAltText}>Test verbinding</Text></Pressable>
        <Text style={styles.hint}>Token maak je in HA: Profiel → Beveiliging → Langlevende toegangstokens. De sensoren verschijnen pas zodra je een cook start (en 'Vlees ligt erop' tikt).</Text>
      </Section>

      <Section title="Data">
        <Pressable style={styles.btn} onPress={exportData}><Text style={styles.btnText}>Exporteer logboek (JSON)</Text></Pressable>
      </Section>

      <Text style={styles.version}>Grillmeister v0.1 · Inkbird IBT-4XS (iBBQ)</Text>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.title}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: theme.space(4), gap: theme.space(4) },
  section: { backgroundColor: theme.colors.card, borderRadius: theme.radius, padding: theme.space(4), gap: theme.space(2) },
  title: { color: theme.colors.text, fontSize: theme.font.h2, fontWeight: '700', marginBottom: 4 },
  label: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '600', marginTop: 4 },
  input: { backgroundColor: theme.colors.cardAlt, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: theme.colors.text },
  hint: { color: theme.colors.textDim, fontSize: theme.font.small, lineHeight: 19 },
  btn: { backgroundColor: theme.colors.accent, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 6 },
  btnText: { color: '#0d0f12', fontWeight: '700' },
  btnAlt: { backgroundColor: theme.colors.cardAlt },
  btnAltText: { color: theme.colors.text, fontWeight: '700' },
  version: { color: theme.colors.textDim, fontSize: theme.font.small, textAlign: 'center' },
});
