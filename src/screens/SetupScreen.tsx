import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Alert, Image, Modal } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { useApp } from '../state/AppContext';
import type { BBQProfile, BBQType, ThermoProfile } from '../logic/types';
import catalog from '../data/bbqCatalog.json';
import { theme } from '../theme';

interface CatBBQModel { model: string; type: string; gridCm?: number }
interface CatBBQBrand { brand: string; models: CatBBQModel[] }
interface CatThermoModel { model: string; supported: boolean; note?: string }
interface CatThermoBrand { brand: string; models: CatThermoModel[] }

const BBQ_BRANDS: CatBBQBrand[] = (catalog as { bbqs: CatBBQBrand[] }).bbqs;
const THERMO_BRANDS: CatThermoBrand[] = (catalog as { thermometers: CatThermoBrand[] }).thermometers;

const TYPE_LABEL: Record<string, string> = { kamado: '🏺 Kamado', kogel: '⚫ Kogel', smoker: '🗼 Smoker', anders: '🔥 Anders' };
const PREHEAT: Record<string, string> = {
  kamado: '~30-45 min (keramiek moet doorwarmen)',
  kogel: '~15-20 min (staal is snel op temp)',
  smoker: '~30-40 min (stabiliseren duurt even)',
  anders: '~20-30 min',
};

/** Simple bottom-sheet single-select, in the app's house style. */
function Sheet({
  visible,
  title,
  options,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: { id: string; label: string; sub?: string }[];
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>{title}</Text>
          <ScrollView>
            {options.map((o) => (
              <Pressable key={o.id} style={styles.sheetRow} onPress={() => onSelect(o.id)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sheetName}>{o.label}</Text>
                  {o.sub ? <Text style={styles.sheetSub}>{o.sub}</Text> : null}
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Pressable>
    </Modal>
  );
}

export default function SetupScreen() {
  const { settings, updateSettings } = useApp();

  // ---- BBQ picker state ----
  const [bbqStep, setBbqStep] = useState<null | 'brand' | 'model' | 'custom'>(null);
  const [bbqBrand, setBbqBrand] = useState<string | null>(null);
  const [cBrand, setCBrand] = useState('');
  const [cModel, setCModel] = useState('');
  const [cType, setCType] = useState<BBQType>('kamado');

  // ---- Thermometer picker state ----
  const [thStep, setThStep] = useState<null | 'brand' | 'model' | 'custom'>(null);
  const [thBrand, setThBrand] = useState<string | null>(null);
  const [tBrand, setTBrand] = useState('');
  const [tModel, setTModel] = useState('');

  const bbq = settings.bbq;
  const thermo = settings.thermo;

  const saveBBQ = (p: BBQProfile) => {
    void updateSettings({ bbq: { ...p, photoUri: bbq?.photoUri } });
    setBbqStep(null);
  };
  const saveThermo = (p: ThermoProfile) => {
    void updateSettings({ thermo: p });
    setThStep(null);
  };

  const addBBQPhoto = async (fromCamera: boolean) => {
    const res = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.6 })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.6 });
    if (res.canceled || !res.assets[0] || !bbq) return;
    let uri = res.assets[0].uri;
    try {
      const dest = `${FileSystem.documentDirectory}bbq-photo.jpg`;
      await FileSystem.copyAsync({ from: uri, to: dest });
      uri = `${dest}?t=${Date.now()}`; // cache-bust so a new photo shows up
    } catch {
      /* keep original uri */
    }
    void updateSettings({ bbq: { ...bbq, photoUri: uri } });
  };
  const choosePhoto = () =>
    Alert.alert('Foto van je BBQ', 'Waar vandaan?', [
      { text: 'Camera', onPress: () => void addBBQPhoto(true) },
      { text: 'Galerij', onPress: () => void addBBQPhoto(false) },
      { text: 'Annuleer', style: 'cancel' },
    ]);

  const brandModels = BBQ_BRANDS.find((b) => b.brand === bbqBrand)?.models ?? [];
  const thModels = THERMO_BRANDS.find((b) => b.brand === thBrand)?.models ?? [];

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {/* ---------------- BBQ ---------------- */}
      <View style={styles.card}>
        <Text style={styles.h}>🔥 Mijn BBQ</Text>
        {bbq ? (
          <>
            {bbq.photoUri ? (
              <Pressable onPress={choosePhoto}>
                <Image source={{ uri: bbq.photoUri }} style={styles.photo} />
                <Text style={styles.photoHint}>Tik om de foto te vervangen</Text>
              </Pressable>
            ) : (
              <Pressable style={styles.photoBtn} onPress={choosePhoto}>
                <Text style={styles.photoBtnText}>📷 Voeg een foto van je BBQ toe</Text>
              </Pressable>
            )}
            <Text style={styles.bigName}>{bbq.brand} {bbq.model}</Text>
            <View style={styles.badges}>
              <View style={styles.badge}><Text style={styles.badgeText}>{TYPE_LABEL[bbq.type] ?? bbq.type}</Text></View>
              {bbq.gridCm != null && <View style={styles.badge}><Text style={styles.badgeText}>Ø {bbq.gridCm} cm rooster</Text></View>}
            </View>
            <Text style={styles.hint}>⏱️ Voorverwarmen: {PREHEAT[bbq.type] ?? PREHEAT.anders}</Text>
            <View style={styles.row}>
              <Pressable style={[styles.btn, styles.btnAlt]} onPress={() => setBbqStep('brand')}><Text style={styles.btnAltText}>Wijzig</Text></Pressable>
              <Pressable style={[styles.btn, styles.btnAlt]} onPress={() => void updateSettings({ bbq: undefined })}><Text style={[styles.btnAltText, { color: theme.colors.danger }]}>Verwijder</Text></Pressable>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.hint}>Kies je merk en model — de app gebruikt dit voor voorverwarmtijd en (straks) passend advies per BBQ-type.</Text>
            <Pressable style={styles.btn} onPress={() => setBbqStep('brand')}><Text style={styles.btnText}>Kies je BBQ</Text></Pressable>
          </>
        )}
      </View>

      {/* ---------------- Thermometer ---------------- */}
      <View style={styles.card}>
        <Text style={styles.h}>🌡️ Mijn thermometer</Text>
        {thermo ? (
          <>
            <Text style={styles.bigName}>{thermo.brand} {thermo.model}</Text>
            <View style={styles.badges}>
              <View style={[styles.badge, thermo.supported && styles.badgeOk]}>
                <Text style={[styles.badgeText, thermo.supported && { color: '#0d0f12' }]}>
                  {thermo.supported ? '✅ Werkt nu live in de app' : '🔜 Geregistreerd — uitlezen volgt later'}
                </Text>
              </View>
            </View>
            <View style={styles.row}>
              <Pressable style={[styles.btn, styles.btnAlt]} onPress={() => setThStep('brand')}><Text style={styles.btnAltText}>Wijzig</Text></Pressable>
              <Pressable style={[styles.btn, styles.btnAlt]} onPress={() => void updateSettings({ thermo: undefined })}><Text style={[styles.btnAltText, { color: theme.colors.danger }]}>Verwijder</Text></Pressable>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.hint}>De Inkbird iBBQ-familie werkt nu al live; andere merken registreer je alvast — uitlezen bouwen we later in.</Text>
            <Pressable style={styles.btn} onPress={() => setThStep('brand')}><Text style={styles.btnText}>Kies je thermometer</Text></Pressable>
          </>
        )}
      </View>

      <Text style={styles.sources}>Catalogus: gangbare kolen-BBQ's op de NL/EU-markt (fabrieksspecificaties). Staat de jouwe er niet bij? Kies "Anders…" en vul 'm zelf in.</Text>

      {/* ---------------- BBQ sheets ---------------- */}
      <Sheet
        visible={bbqStep === 'brand'}
        title="Kies je merk"
        options={[...BBQ_BRANDS.map((b) => ({ id: b.brand, label: b.brand, sub: b.models.map((m) => m.model).slice(0, 3).join(' · ') + (b.models.length > 3 ? ' …' : '') })), { id: '_other', label: 'Anders…', sub: 'Merk en model zelf invullen' }]}
        onSelect={(id) => {
          if (id === '_other') { setBbqStep('custom'); return; }
          setBbqBrand(id);
          setBbqStep('model');
        }}
        onClose={() => setBbqStep(null)}
      />
      <Sheet
        visible={bbqStep === 'model'}
        title={`${bbqBrand ?? ''} — kies je model`}
        options={brandModels.map((m) => ({ id: m.model, label: m.model, sub: [TYPE_LABEL[m.type] ?? m.type, m.gridCm != null ? `Ø ${m.gridCm} cm` : null].filter(Boolean).join(' · ') }))}
        onSelect={(id) => {
          const m = brandModels.find((x) => x.model === id);
          if (!m || !bbqBrand) return;
          saveBBQ({ brand: bbqBrand, model: m.model, type: (m.type as BBQType) ?? 'anders', gridCm: m.gridCm });
        }}
        onClose={() => setBbqStep(null)}
      />
      <Modal visible={bbqStep === 'custom'} transparent animationType="fade" onRequestClose={() => setBbqStep(null)}>
        <Pressable style={styles.backdrop} onPress={() => setBbqStep(null)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>Eigen BBQ invullen</Text>
            <Text style={styles.label}>Merk</Text>
            <TextInput style={styles.input} value={cBrand} onChangeText={setCBrand} placeholder="bijv. Landmann" placeholderTextColor={theme.colors.textDim} />
            <Text style={styles.label}>Model</Text>
            <TextInput style={styles.input} value={cModel} onChangeText={setCModel} placeholder="bijv. Black Pearl" placeholderTextColor={theme.colors.textDim} />
            <Text style={styles.label}>Type</Text>
            <View style={styles.row}>
              {(['kamado', 'kogel', 'smoker', 'anders'] as BBQType[]).map((t) => (
                <Pressable key={t} style={[styles.chip, cType === t && styles.chipSel]} onPress={() => setCType(t)}>
                  <Text style={[styles.chipText, cType === t && { color: '#0d0f12' }]}>{TYPE_LABEL[t]}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              style={[styles.btn, { marginTop: 10 }]}
              onPress={() => {
                if (!cBrand.trim() || !cModel.trim()) { Alert.alert('Vul merk en model in'); return; }
                saveBBQ({ brand: cBrand.trim(), model: cModel.trim(), type: cType });
              }}
            >
              <Text style={styles.btnText}>Opslaan</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ---------------- Thermometer sheets ---------------- */}
      <Sheet
        visible={thStep === 'brand'}
        title="Kies je merk"
        options={[...THERMO_BRANDS.map((b) => ({ id: b.brand, label: b.brand, sub: b.models.map((m) => m.model).slice(0, 3).join(' · ') + (b.models.length > 3 ? ' …' : '') })), { id: '_other', label: 'Anders…', sub: 'Merk en model zelf invullen' }]}
        onSelect={(id) => {
          if (id === '_other') { setThStep('custom'); return; }
          setThBrand(id);
          setThStep('model');
        }}
        onClose={() => setThStep(null)}
      />
      <Sheet
        visible={thStep === 'model'}
        title={`${thBrand ?? ''} — kies je model`}
        options={thModels.map((m) => ({ id: m.model, label: m.model, sub: [m.supported ? '✅ werkt nu live' : '🔜 uitlezen volgt', m.note].filter(Boolean).join(' · ') }))}
        onSelect={(id) => {
          const m = thModels.find((x) => x.model === id);
          if (!m || !thBrand) return;
          saveThermo({ brand: thBrand, model: m.model, supported: m.supported });
        }}
        onClose={() => setThStep(null)}
      />
      <Modal visible={thStep === 'custom'} transparent animationType="fade" onRequestClose={() => setThStep(null)}>
        <Pressable style={styles.backdrop} onPress={() => setThStep(null)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>Eigen thermometer invullen</Text>
            <Text style={styles.label}>Merk</Text>
            <TextInput style={styles.input} value={tBrand} onChangeText={setTBrand} placeholder="bijv. Rösle" placeholderTextColor={theme.colors.textDim} />
            <Text style={styles.label}>Model</Text>
            <TextInput style={styles.input} value={tModel} onChangeText={setTModel} placeholder="bijv. Core 2" placeholderTextColor={theme.colors.textDim} />
            <Pressable
              style={[styles.btn, { marginTop: 10 }]}
              onPress={() => {
                if (!tBrand.trim() || !tModel.trim()) { Alert.alert('Vul merk en model in'); return; }
                saveThermo({ brand: tBrand.trim(), model: tModel.trim(), supported: false });
              }}
            >
              <Text style={styles.btnText}>Opslaan</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: theme.space(4), gap: theme.space(4) },
  card: { backgroundColor: theme.colors.card, borderRadius: theme.radius, padding: theme.space(4), gap: theme.space(3) },
  h: { color: theme.colors.text, fontSize: theme.font.h2, fontWeight: '700' },
  hint: { color: theme.colors.textDim, fontSize: theme.font.small, lineHeight: 19 },
  bigName: { color: theme.colors.text, fontSize: theme.font.h2, fontWeight: '800' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  badge: { backgroundColor: theme.colors.cardAlt, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  badgeOk: { backgroundColor: theme.colors.accent },
  badgeText: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '600' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  btn: { backgroundColor: theme.colors.accent, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center' },
  btnText: { color: '#0d0f12', fontWeight: '700' },
  btnAlt: { backgroundColor: theme.colors.cardAlt, flex: 1 },
  btnAltText: { color: theme.colors.text, fontWeight: '700' },
  photo: { width: '100%', height: 180, borderRadius: theme.radius, backgroundColor: theme.colors.cardAlt },
  photoHint: { color: theme.colors.textDim, fontSize: theme.font.small, textAlign: 'center', marginTop: 6 },
  photoBtn: { backgroundColor: theme.colors.cardAlt, borderRadius: theme.radius, paddingVertical: theme.space(5), alignItems: 'center' },
  photoBtnText: { color: theme.colors.textDim },
  label: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '600', marginTop: 6 },
  input: { backgroundColor: theme.colors.cardAlt, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: theme.colors.text, marginTop: 4 },
  chip: { backgroundColor: theme.colors.cardAlt, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  chipSel: { backgroundColor: theme.colors.accent },
  chipText: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '600' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: theme.colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: theme.space(4), maxHeight: '75%' },
  sheetTitle: { color: theme.colors.text, fontSize: theme.font.h2, fontWeight: '700', marginBottom: theme.space(2) },
  sheetRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.line },
  sheetName: { color: theme.colors.text, fontSize: theme.font.body },
  sheetSub: { color: theme.colors.textDim, fontSize: theme.font.small, marginTop: 2 },
  sources: { color: theme.colors.textDim, fontSize: 11, lineHeight: 16, textAlign: 'center' },
});
