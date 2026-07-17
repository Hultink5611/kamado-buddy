export type CookMethod = 'direct' | 'indirect' | 'reverse';

export interface Meat {
  id: string;
  name: string;
  emoji: string;
  category: string;
  method: CookMethod;
  domeTempC: number;
  searDomeTempC?: number;
  coreTempC: number | null;
  doneness?: Record<string, number>;
  flipIntervalMin: number | null;
  estimate: { type: 'thickness' | 'weight'; baseMin: number; minPerCm?: number; minPerKg?: number };
  frozenFactor: number;
  restMin: number;
  /** Minutes to let the meat come to room temperature before it goes on. */
  temperMin?: number;
  tips: string;
}

export interface VentBand {
  maxC: number;
  label: string;
  coalFill: string;
  bottomVent: number; // 0..1
  topVent: number; // 0..1
}

export interface CookInput {
  meatId: string;
  doneness?: string;
  weightKg?: number;
  thicknessCm?: number;
  frozen: boolean;
  photoUri?: string;
}

export interface TempSample {
  t: number; // ms epoch
  ambientC: number | null;
  meatC: number | null;
}

export interface Cook {
  id: string;
  startedAt: number;
  endedAt?: number;
  input: CookInput;
  meatName: string;
  targetCoreC: number | null;
  targetDomeC: number;
  ambientChannel: number; // probe index used for ambient
  meatChannel: number; // probe index used for meat
  samples: TempSample[];
  notes?: string;
}

/**
 * A cook that is currently running. Lives in AppContext (not in a screen) so
 * the sampling loop, alarms and dashboard-push keep running while you navigate
 * away from the live screen — and it is persisted so it survives an app
 * restart / OTA reload.
 */
export interface ActiveCook {
  input: CookInput;
  startedAt: number;
  ambientCh: number;
  meatCh: number;
  samples: TempSample[];
  manualAmbient: string;
  manualMeat: string;
  /** When the meat was last flipped (for the flip reminder + "late" counter). */
  lastFlipAt: number;
}

/** A stable vent setting learned for a target temperature band. */
export interface LearnedSetting {
  bandMaxC: number;
  bottomVent: number;
  topVent: number;
  observedAmbientC: number;
  updatedAt: number;
  samples: number;
}
