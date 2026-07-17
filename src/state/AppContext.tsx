import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useInkbird } from '../ble/useInkbird';
import { getSetting, setSetting, getLearned, saveCook, saveLearned } from '../storage/db';
import {
  getMeat,
  resolveTargetCore,
  computeMeats,
  setMeatCustomization,
  upsertMeat,
  removeMeat,
  EMPTY_MEAT_CUSTOMIZATION,
  type MeatCustomization,
} from '../logic/cook';
import { getSteeringAdvice } from '../logic/steering';
import { getLearnedForTarget, isStable, upsertLearned } from '../logic/learning';
import { fireAlarm, showCookStatus, clearCookStatus } from '../logic/notifications';
import { pushToHA, pushCookEnded } from '../ha/haPush';
import type { AIKeys } from '../ai/steerAI';
import type { HAConfig } from '../ha/haPush';
import type { ActiveCook, Cook, CookInput, LearnedSetting, Meat, TempSample } from '../logic/types';

interface Settings {
  ambientChannel: number;
  meatChannel: number;
  alarmMarginC: number;
  keys: AIKeys;
  ha: HAConfig;
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

const DEFAULTS: Settings = {
  ambientChannel: 0,
  meatChannel: 1,
  alarmMarginC: 15,
  keys: {},
  ha: {},
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
      if (raw) setSettings({ ...DEFAULTS, ...JSON.parse(raw) });
      setLearned(await getLearned());
      // Restore custom / edited / deleted meats.
      const meatRaw = await getSetting('meatCustom');
      if (meatRaw) {
        try {
          const c = JSON.parse(meatRaw) as MeatCustomization;
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
    appliedVent: { bottom: 0.5, top: 0.5 },
  });

  const startCook = (input: CookInput) => {
    alarmRef.current = {
      firedCore: false,
      ambientOut: false,
      learnedFired: false,
      appliedVent: { bottom: 0.5, top: 0.5 },
    };
    setActiveCook({
      input,
      startedAt: Date.now(),
      ambientCh: settings.ambientChannel,
      meatCh: settings.meatChannel,
      samples: [],
      manualAmbient: '',
      manualMeat: '',
    });
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
      targetCoreC: meat ? resolveTargetCore(meat, ac.input.doneness) : null,
      targetDomeC: meat?.domeTempC ?? 0,
      ambientChannel: ac.ambientCh,
      meatChannel: ac.meatCh,
      samples: ac.samples,
    };
    await saveCook(cook);
    setActiveCook(null);
    await clearCookStatus();
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
      const targetDomeC = meat.domeTempC;
      const targetCoreC = resolveTargetCore(meat, ac.input.doneness);
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

      // Ongoing status notification.
      void showCookStatus(
        `${meat.emoji} ${meat.name} · BBQ ${currentAmbient != null ? Math.round(currentAmbient) : '–'}° · kern ${
          currentMeat != null ? Math.round(currentMeat) : '–'
        }°`
      );

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

      // Core-temp reached alarm.
      if (
        !alarmRef.current.firedCore &&
        targetCoreC != null &&
        currentMeat != null &&
        currentMeat >= targetCoreC
      ) {
        alarmRef.current.firedCore = true;
        void fireAlarm(
          '✅ Kerntemp bereikt!',
          `${meat.name} zit op ${Math.round(currentMeat)}°C. Haal 'm eraf en laat rusten (${meat.restMin} min).`
        );
      }

      // BBQ out-of-range alarm.
      if (currentAmbient != null) {
        const off = Math.abs(currentAmbient - targetDomeC) > s.settings.alarmMarginC;
        if (off && !alarmRef.current.ambientOut) {
          alarmRef.current.ambientOut = true;
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
