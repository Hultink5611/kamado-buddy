import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useInkbird } from '../ble/useInkbird';
import { getSetting, setSetting, getLearned } from '../storage/db';
import type { AIKeys } from '../ai/steerAI';
import type { LearnedSetting } from '../logic/types';

interface Settings {
  ambientChannel: number;
  meatChannel: number;
  alarmMarginC: number;
  keys: AIKeys;
}

interface AppValue {
  ink: ReturnType<typeof useInkbird>;
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  learned: LearnedSetting[];
  reloadLearned: () => Promise<void>;
}

const DEFAULTS: Settings = {
  ambientChannel: 0,
  meatChannel: 1,
  alarmMarginC: 15,
  keys: {},
};

const Ctx = createContext<AppValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const ink = useInkbird();
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [learned, setLearned] = useState<LearnedSetting[]>([]);

  useEffect(() => {
    (async () => {
      const raw = await getSetting('settings');
      if (raw) setSettings({ ...DEFAULTS, ...JSON.parse(raw) });
      setLearned(await getLearned());
    })();
  }, []);

  const updateSettings = async (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch, keys: { ...settings.keys, ...(patch.keys ?? {}) } };
    setSettings(next);
    await setSetting('settings', JSON.stringify(next));
  };

  const reloadLearned = async () => setLearned(await getLearned());

  const value = useMemo(
    () => ({ ink, settings, updateSettings, learned, reloadLearned }),
    [ink, settings, learned]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used within AppProvider');
  return v;
}
