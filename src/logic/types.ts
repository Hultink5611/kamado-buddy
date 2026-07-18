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
  /** Typical weight (kg) used for the time estimate when none is entered. */
  typicalWeightKg?: number;
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
  /** Optional marinade used for this cook (shown in the logbook). */
  marinadeId?: string;
  marinadeName?: string;
  /** User override of the BBQ/dome target (°C) — e.g. slow cook at 150. */
  domeTempOverrideC?: number;
  /** User override of the target core temp (°C). */
  coreTempOverrideC?: number;
  /** Finish the cook with a hard sear (reverse sear): gentle → sear at the end. */
  searFinish?: boolean;
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
  /** Photo of the finished result, taken from the logbook. */
  resultPhotoUri?: string;
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
  /**
   * When the meat actually went ON the grill (null while still tempering /
   * bringing the BBQ up to temp). Total cook time + flip timer start from here.
   */
  grillOnAt: number | null;
  /** When the meat was last flipped (for the flip reminder + "late" counter). */
  lastFlipAt: number;
  /** When the final sear phase started (reverse sear). Null until you sear. */
  searStartedAt: number | null;
}

/**
 * A marinade you've discovered / created for a cut of meat — with an optional
 * photo, a personal note and a rating (cijfer 1–10). Stored in the marinade
 * library so you can build up a collection of favourites.
 */
export interface Marinade {
  id: string;
  name: string;
  /** Which cut it's for, free text (e.g. "Short rib"). */
  forMeat?: string;
  /** Link to the meat/vegetable in the list, so marinades group per cut. */
  meatId?: string;
  /** How much meat the amounts are for, e.g. "4 hamburgers (~600 g)". */
  amount?: string;
  ingredients: string;
  method?: string;
  note?: string;
  /** Rating out of 10. */
  rating?: number;
  photoUri?: string;
  createdAt: number;
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
