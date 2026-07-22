import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useInkbird } from '../ble/useInkbird';
import { getSetting, setSetting, getLearned, saveCook, saveLearned } from '../storage/db';
import {
  getMeat,
  resolveTargetDome,
  resolveTargetCoreForInput,
  searDomeTarget,
  SEAR_LEAD_C,
  sanitizeMeat,
  BUILTIN_MEATS,
  computeMeats,
  setMeatCustomization,
  upsertMeat,
  removeMeat,
  EMPTY_MEAT_CUSTOMIZATION,
  type MeatCustomization,
} from '../logic/cook';
import { getSteeringAdvice } from '../logic/steering';
import { getLearnedForTarget, isStable, upsertLearned } from '../logic/learning';
import {
  fireAlarm,
  showCookStatus,
  clearCookStatus,
  scheduleTemperReminder,
  cancelTemperReminder,
} from '../logic/notifications';
import { pushToHA, pushCookEnded } from '../ha/haPush';
import type { AIKeys } from '../ai/steerAI';
import type { HAConfig } from '../ha/haPush';
import type { ActiveCook, BBQProfile, Cook, CookInput, LearnedSetting, Meat, TempSample, ThermoProfile } from '../logic/types';

/** Per-type notification switches. All default on (current behaviour). */
export interface NotifySettings {
  enabled: boolean; // master switch
  core: boolean; // kerntemp bereikt
  flip: boolean; // draaien
  ambient: boolean; // BBQ buiten bereik
  sear: boolean; // tijd om te searen
  temper: boolean; // "leg 'm erop"
  status: boolean; // aanhoudende status-melding
}

interface Settings {
  ambientChannel: number;
  meatChannel: number;
  alarmMarginC: number;
  keys: AIKeys;
  ha: HAConfig;
  notify: NotifySettings;
  /** Mijn setup: eigen BBQ + thermometer (optioneel). */
  bbq?: BBQProfile;
  thermo?: ThermoProfile;
  /** Eenvoudige modus: live-scherm toont alleen temperaturen + timers. */
  simpleMode: boolean;
}

interface AppValue {
  ink: ReturnType<typeof useInkbird>;
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  learned: LearnedSetting[];
  reloadLearned: () => Promise<void>;
  /** The cook currently running (null when idle). Survives navigation + restart. */
  activeCook: ActiveCook | null;
  startCook: (input: CookInput) => void;
  updateActiveCook: (patch: Partial<ActiveCook>) => void;
  finishCook: () => Promise<string | null>;
  /** Effective meat list (built-in + user customisation). */
  meats: Meat[];
  saveMeat: (meat: Meat) => Promise<void>;
  deleteMeat: (id: string) => Promise<void>;
}

export const DEFAULT_NOTIFY: NotifySettings = {
  enabled: true,
  core: true,
  flip: true,
  ambient: true,
  sear: true,
  temper: true,
  status: true,
};

const DEFAULTS: Settings = {
  ambientChannel: 0,
  meatChannel: 1,
  alarmMarginC: 15,
  keys: {},
  ha: {},
  notify: DEFAULT_NOTIFY,
  simpleMode: false,
};

const SAMPLE_MS = 5000;

const Ctx = createContext<AppValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const ink = useInkbird();
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [learned, setLearned] = useState<LearnedSetting[]>([]);
  const [activeCook, setActiveCook] = useState<ActiveCook | null>(null);
  const [meats, setMeats] = useState<Meat[]>(() => computeMeats(EMPTY_MEAT_CUSTOMIZATION));
  const meatCustomRef = useRef<MeatCustomization>(EMPTY_MEAT_CUSTOMIZATION);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    (async () => {
      const raw = await getSetting('settings');
      if (raw) {
        const parsed = JSON.parse(raw);
        setSettings({ ...DEFAULTS, ...parsed, notify: { ...DEFAULT_NOTIFY, ...(parsed.notify ?? {}) } });
      }
      setLearned(await getLearned());
      // Restore custom / edited / deleted meats.
      const meatRaw = await getSetting('meatCustom');
      if (meatRaw) {
        try {
          let c = JSON.parse(meatRaw) as MeatCustomization;
          // One-time cleanup (v1): drop AI-added items that duplicate a
          // built-in cut (e.g. an old "houthakkersteak" with a bad estimate)
          // and clamp implausible numbers on the remaining custom items.
          // Items whose name merely CONTAINS a built-in name (e.g.
          // "Diepvries hamburger") are kept — only real duplicates go.
          const cleaned = await getSetting('meatCleanup1');
          if (!cleaned) {
            const norm = (s: string) =>
              s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
            const builtinNames = BUILTIN_MEATS.map((b) => norm(b.name));
            c = {
              ...c,
              added: c.added
                .filter((m) => {
                  const n = norm(m.name);
                  return !builtinNames.some((b) => b === n || b.includes(n));
                })
                .map(sanitizeMeat),
            };
            await setSetting('meatCustom', JSON.stringify(c));
            await setSetting('meatCleanup1', '1');
          }
          meatCustomRef.current = c;
          setMeatCustomization(c);
          setMeats(computeMeats(c));
        } catch {
          /* corrupt — keep built-in list */
        }
      }
      // Restore a cook that was running before the app was closed / reloaded.
      const cookRaw = await getSetting('activeCook');
      if (cookRaw) {
        try {
          setActiveCook(JSON.parse(cookRaw) as ActiveCook);
        } catch {
          /* corrupt — ignore */
        }
      }
      setHydrated(true);
    })();
  }, []);

  const updateSettings = async (patch: Partial<Settings>) => {
    const next = {
      ...settings,
      ...patch,
      keys: { ...settings.keys, ...(patch.keys ?? {}) },
      ha: { ...settings.ha, ...(patch.ha ?? {}) },
      notify: { ...settings.notify, ...(patch.notify ?? {}) },
    };
    setSettings(next);
    await setSetting('settings', JSON.stringify(next));
  };

  const reloadLearned = async () => setLearned(await getLearned());

  // ---- Meat customisation (add / edit / delete) --------------------------
  const persistMeatCustom = async (c: MeatCustomization) => {
    meatCustomRef.current = c;
    setMeatCustomization(c); // keep the module registry (getMeat) in sync
    setMeats(computeMeats(c));
    await setSetting('meatCustom', JSON.stringify(c));
  };
  const saveMeat = (meat: Meat) => persistMeatCustom(upsertMeat(meatCustomRef.current, meat));
  const deleteMeat = (id: string) => persistMeatCustom(removeMeat(meatCustomRef.current, id));

  // ---- Active-cook engine -------------------------------------------------
  // Everything the live screen used to do runs HERE instead, so it keeps
  // running while you're on another screen. The screen only renders it.

  // Latest values for the interval callback (avoids stale closures).
  const stateRef = useRef({ ink, settings, learned, activeCook });
  stateRef.current = { ink, settings, learned, activeCook };
  const alarmRef = useRef({
    firedCore: false,
    ambientOut: false,
    learnedFired: false,
    flipNotifiedAt: 0, // the lastFlipAt value we already sent a "flip" alarm for
    lastAmbientAlarmAt: 0, // debounce the "BBQ out of range" alarm
    searPrompted: false, // "tijd om te searen" alarm already sent
    appliedVent: { bottom: 0.5, top: 0.5 },
  });

  const startCook = (input: CookInput) => {
    const now = Date.now();
    alarmRef.current = {
      firedCore: false,
      ambientOut: false,
      learnedFired: false,
      flipNotifiedAt: 0,
      lastAmbientAlarmAt: 0,
      searPrompted: false,
      appliedVent: { bottom: 0.5, top: 0.5 },
    };
    setActiveCook({
      input,
      startedAt: now,
      ambientCh: settings.ambientChannel,
      meatCh: settings.meatChannel,
      samples: [],
      manualAmbient: '',
      manualMeat: '',
      grillOnAt: null, // set when the user taps "vlees ligt erop"
      lastFlipAt: now,
      searStartedAt: null, // set when the user taps "ik ga searen"
    });
    // "Meat can go on" reminder after the meat's temper time.
    const meat = getMeat(input.meatId);
    if (settings.notify.enabled && settings.notify.temper)
      void scheduleTemperReminder(meat?.name ?? 'Je vlees', meat?.temperMin ?? 0);
  };

  const updateActiveCook = (patch: Partial<ActiveCook>) =>
    setActiveCook((prev) => (prev ? { ...prev, ...patch } : prev));

  const finishCook = async (): Promise<string | null> => {
    const ac = stateRef.current.activeCook;
    if (!ac) return null;
    const meat = getMeat(ac.input.meatId);
    const cook: Cook = {
      id: `${ac.startedAt}`,
      startedAt: ac.startedAt,
      endedAt: Date.now(),
      input: ac.input,
      meatName: meat?.name ?? 'Onbekend',
      targetCoreC: meat ? resolveTargetCoreForInput(meat, ac.input) : null,
      targetDomeC: meat ? resolveTargetDome(meat, ac.input) : 0,
      ambientChannel: ac.ambientCh,
      meatChannel: ac.meatCh,
      samples: ac.samples,
    };
    await saveCook(cook);
    setActiveCook(null);
    await clearCookStatus();
    await cancelTemperReminder();
    await pushCookEnded(stateRef.current.settings.ha);
    return cook.id;
  };

  // Persist the active cook so it survives an app restart / OTA reload.
  useEffect(() => {
    if (!hydrated) return;
    if (activeCook) void setSetting('activeCook', JSON.stringify(activeCook));
    else void setSetting('activeCook', '');
  }, [activeCook, hydrated]);

  // The loop: one interval that lives for the whole cook (starts when a cook
  // begins, stops when it ends). Reads the latest state from refs each tick.
  const cooking = activeCook != null;
  useEffect(() => {
    if (!cooking) return;
    const tick = () => {
      const s = stateRef.current;
      const ac = s.activeCook;
      if (!ac) return;
      const meat = getMeat(ac.input.meatId);
      if (!meat) return;
      // During the final sear phase the BBQ target jumps to the hot sear temp,
      // so coaching + the "BBQ too hot" alarm follow the sear instead of nagging.
      const searing = ac.searStartedAt != null;
      const targetDomeC = searing ? searDomeTarget(meat) : resolveTargetDome(meat, ac.input);
      const targetCoreC = resolveTargetCoreForInput(meat, ac.input);
      const currentAmbient =
        s.ink.channels[ac.ambientCh] ?? (ac.manualAmbient ? parseFloat(ac.manualAmbient) : null);
      const currentMeat =
        s.ink.channels[ac.meatCh] ?? (ac.manualMeat ? parseFloat(ac.manualMeat) : null);

      // Record a sample (~1h ring buffer at 5s).
      const sample: TempSample = { t: Date.now(), ambientC: currentAmbient, meatC: currentMeat };
      setActiveCook((prev) =>
        prev ? { ...prev, samples: [...prev.samples, sample].slice(-720) } : prev
      );

      const learnedSetting = getLearnedForTarget(s.learned, targetDomeC);
      const advice = getSteeringAdvice(targetDomeC, currentAmbient, ac.samples, learnedSetting);
      alarmRef.current.appliedVent = { bottom: advice.suggestedBottom, top: advice.suggestedTop };

      // Notification switches (Instellingen → Meldingen).
      const n = s.settings.notify ?? DEFAULT_NOTIFY;
      const notifyOn = (k: keyof NotifySettings) => n.enabled && n[k];

      // Ongoing status notification.
      if (notifyOn('status')) {
        void showCookStatus(
          `${meat.emoji} ${meat.name} · BBQ ${currentAmbient != null ? Math.round(currentAmbient) : '–'}° · kern ${
            currentMeat != null ? Math.round(currentMeat) : '–'
          }°`
        );
      } else {
        void clearCookStatus();
      }

      // Push to Home Assistant (thuishub dashboard).
      void pushToHA(s.settings.ha, {
        meatName: meat.name,
        ambientC: currentAmbient,
        meatC: currentMeat,
        targetDomeC,
        targetCoreC,
        advice,
        active: true,
      });

      // Reverse sear: prompt to start searing a few °C before the core target,
      // but only once the meat is on and you haven't started searing yet.
      if (
        ac.input.searFinish &&
        !searing &&
        !alarmRef.current.searPrompted &&
        ac.grillOnAt != null &&
        targetCoreC != null &&
        currentMeat != null &&
        currentMeat >= targetCoreC - SEAR_LEAD_C
      ) {
        alarmRef.current.searPrompted = true;
        if (notifyOn('sear'))
          void fireAlarm(
            '🔥 Tijd om dicht te schroeien!',
            `Kern zit op ${Math.round(currentMeat)}°C. Open de BBQ, stook op naar ~${searDomeTarget(meat)}°C en schroei kort dicht tot ${targetCoreC}°C. Tik op "Ik ga searen" in de app.`
          );
      }

      // Core-temp reached alarm.
      if (
        !alarmRef.current.firedCore &&
        targetCoreC != null &&
        currentMeat != null &&
        currentMeat >= targetCoreC
      ) {
        alarmRef.current.firedCore = true;
        if (notifyOn('core'))
          void fireAlarm(
            '✅ Kerntemp bereikt!',
            `${meat.name} zit op ${Math.round(currentMeat)}°C. Haal 'm eraf en laat rusten (${meat.restMin} min).`
          );
      }

      // Flip reminder — per meat (meat.flipIntervalMin). Fires once per cycle:
      // when the meat is due, and again only after the user taps "gedraaid"
      // (which moves lastFlipAt). The "X min te laat" counter lives in the UI.
      if (ac.grillOnAt != null && meat.flipIntervalMin != null && meat.flipIntervalMin > 0) {
        const lastFlipAt = ac.lastFlipAt ?? ac.grillOnAt;
        const dueMs = meat.flipIntervalMin * 60_000;
        if (Date.now() - lastFlipAt >= dueMs && alarmRef.current.flipNotifiedAt !== lastFlipAt) {
          alarmRef.current.flipNotifiedAt = lastFlipAt;
          if (notifyOn('flip')) void fireAlarm('🔄 Draaien!', `Tijd om ${meat.name} te draaien.`);
        }
      }

      // BBQ out-of-range alarm — only once the meat is on the grill (no alarms
      // while pre-heating), re-armed when back in range, and at most once per
      // 10 min so normal temp swings don't spam notifications.
      if (ac.grillOnAt != null && currentAmbient != null) {
        const off = Math.abs(currentAmbient - targetDomeC) > s.settings.alarmMarginC;
        const quietForMs = Date.now() - alarmRef.current.lastAmbientAlarmAt;
        if (off && !alarmRef.current.ambientOut && quietForMs > 10 * 60_000) {
          alarmRef.current.ambientOut = true;
          alarmRef.current.lastAmbientAlarmAt = Date.now();
          if (notifyOn('ambient'))
            void fireAlarm(
              '🌡️ BBQ buiten bereik',
              `Omgeving ${Math.round(currentAmbient)}°C (doel ${targetDomeC}°C). ${advice.detail}`
            );
        } else if (!off) {
          alarmRef.current.ambientOut = false;
        }
      }

      // Passive learning: remember the vent setting once stable.
      if (
        !alarmRef.current.learnedFired &&
        currentAmbient != null &&
        isStable([...ac.samples, sample], targetDomeC)
      ) {
        alarmRef.current.learnedFired = true;
        const next = upsertLearned(
          s.learned,
          targetDomeC,
          alarmRef.current.appliedVent.bottom,
          alarmRef.current.appliedVent.top,
          currentAmbient,
          Date.now()
        );
        void saveLearned(next).then(reloadLearned);
      }
    };
    const id = setInterval(tick, SAMPLE_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cooking]);

  const value = useMemo(
    () => ({
      ink,
      settings,
      updateSettings,
      learned,
      reloadLearned,
      activeCook,
      startCook,
      updateActiveCook,
      finishCook,
      meats,
      saveMeat,
      deleteMeat,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ink, settings, learned, activeCook, meats]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used within AppProvider');
  return v;
}
