import type { Meat, CookInput, TempSample } from './types';
import meatData from '../data/meats.json';

export const MEATS: Meat[] = (meatData.meats as unknown) as Meat[];

export function getMeat(id: string): Meat | undefined {
  return MEATS.find((m) => m.id === id);
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
    const kg = input.weightKg ?? 1;
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
