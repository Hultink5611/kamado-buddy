import type { Meat, CookInput, TempSample } from './types';
import meatData from '../data/meats.json';

/** The shipped meat database. Never mutated. */
export const BUILTIN_MEATS: Meat[] = (meatData.meats as unknown) as Meat[];

/**
 * User customisation layered on top of the built-in list: fully new meats,
 * edits to built-in meats (overrides by id) and deleted built-in meats (hidden).
 * Persisted in AppContext; the module keeps a copy so getMeat() stays in sync.
 */
export interface MeatCustomization {
  added: Meat[];
  overrides: Record<string, Meat>;
  hidden: string[];
}

export const EMPTY_MEAT_CUSTOMIZATION: MeatCustomization = { added: [], overrides: {}, hidden: [] };

let _custom: MeatCustomization = EMPTY_MEAT_CUSTOMIZATION;

/** Keep the module-level registry in sync (call from AppContext on load/change). */
export function setMeatCustomization(c: MeatCustomization): void {
  _custom = c;
}

export function isBuiltinMeat(id: string): boolean {
  return BUILTIN_MEATS.some((m) => m.id === id);
}

/** Built-in list (minus deleted, with edits applied) + user-added meats. */
export function computeMeats(c: MeatCustomization): Meat[] {
  const base = BUILTIN_MEATS.filter((m) => !c.hidden.includes(m.id)).map(
    (m) => c.overrides[m.id] ?? m
  );
  return [...base, ...c.added];
}

/** The effective meat list (built-in + customisation). */
export function allMeats(): Meat[] {
  return computeMeats(_custom);
}

export function getMeat(id: string): Meat | undefined {
  return allMeats().find((m) => m.id === id);
}

/** Pure: add a new meat or update an existing one (built-in edit = override). */
export function upsertMeat(c: MeatCustomization, meat: Meat): MeatCustomization {
  if (isBuiltinMeat(meat.id)) {
    return {
      ...c,
      hidden: c.hidden.filter((h) => h !== meat.id),
      overrides: { ...c.overrides, [meat.id]: meat },
    };
  }
  const exists = c.added.some((m) => m.id === meat.id);
  return {
    ...c,
    added: exists ? c.added.map((m) => (m.id === meat.id ? meat : m)) : [...c.added, meat],
  };
}

/** Pure: delete a meat (built-in = hide, custom = remove). */
export function removeMeat(c: MeatCustomization, id: string): MeatCustomization {
  if (isBuiltinMeat(id)) {
    const overrides = { ...c.overrides };
    delete overrides[id];
    return { ...c, overrides, hidden: c.hidden.includes(id) ? c.hidden : [...c.hidden, id] };
  }
  return { ...c, added: c.added.filter((m) => m.id !== id) };
}

/** Make a URL-safe, unique-ish id from a name (for user/AI-added meats). */
export function slugMeatId(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  return `custom-${base || 'vlees'}-${Math.round(Date.now() % 1e7)}`;
}

export function resolveTargetCore(meat: Meat, doneness?: string): number | null {
  if (doneness && meat.doneness && meat.doneness[doneness] != null) {
    return meat.doneness[doneness];
  }
  return meat.coreTempC;
}

/**
 * Rough estimate of total cook minutes. Direct cooks scale with thickness,
 * low & slow with weight. Frozen multiplies. This is a *starting* estimate;
 * the real signal during the cook is the meat probe.
 */
export function estimateCookMinutes(meat: Meat, input: CookInput): number {
  const e = meat.estimate;
  let mins = e.baseMin;
  if (e.type === 'thickness') {
    const cm = input.thicknessCm ?? 3;
    mins = e.baseMin + (e.minPerCm ?? 0) * cm;
  } else {
    const kg = input.weightKg ?? meat.typicalWeightKg ?? 1;
    mins = e.baseMin + (e.minPerKg ?? 0) * kg;
  }
  if (input.frozen) mins *= meat.frozenFactor;
  return Math.round(mins);
}

/** Progress 0..1 based on meat probe vs target core; falls back to elapsed time. */
export function cookProgress(
  targetCoreC: number | null,
  currentMeatC: number | null,
  elapsedMin: number,
  estimateMin: number,
  startMeatC = 8
): number {
  if (targetCoreC != null && currentMeatC != null) {
    const span = targetCoreC - startMeatC;
    if (span <= 0) return 1;
    return clamp((currentMeatC - startMeatC) / span, 0, 1);
  }
  if (estimateMin <= 0) return 0;
  return clamp(elapsedMin / estimateMin, 0, 1);
}

/**
 * Predict minutes remaining from the recent rise-rate of the meat probe.
 * Returns null when there isn't enough signal yet.
 */
export function predictMinutesRemaining(
  samples: TempSample[],
  targetCoreC: number | null
): number | null {
  if (targetCoreC == null) return null;
  const pts = samples.filter((s) => s.meatC != null);
  if (pts.length < 4) return null;
  const recent = pts.slice(-8);
  const first = recent[0];
  const last = recent[recent.length - 1];
  const dMin = (last.t - first.t) / 60000;
  if (dMin <= 0) return null;
  const ratePerMin = ((last.meatC as number) - (first.meatC as number)) / dMin;
  if (ratePerMin <= 0.05) return null; // stalled or falling
  const remainingC = targetCoreC - (last.meatC as number);
  if (remainingC <= 0) return 0;
  return Math.round(remainingC / ratePerMin);
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function ventLabel(fraction: number): string {
  if (fraction < 0.15) return 'dicht / kier';
  if (fraction < 0.4) return 'kwart open';
  if (fraction < 0.6) return 'half open';
  if (fraction < 0.85) return 'driekwart open';
  return 'helemaal open';
}
