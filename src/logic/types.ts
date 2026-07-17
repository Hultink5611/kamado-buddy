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

/** A stable vent setting learned for a target temperature band. */
export interface LearnedSetting {
  bandMaxC: number;
  bottomVent: number;
  topVent: number;
  observedAmbientC: number;
  updatedAt: number;
  samples: number;
}
