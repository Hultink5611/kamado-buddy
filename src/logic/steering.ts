import type { VentBand, LearnedSetting, TempSample } from './types';
import ventData from '../data/ventGuide.json';
import { ventLabel } from './cook';

export const VENT_BANDS: VentBand[] = (ventData.bands as unknown) as VentBand[];

const DEADBAND_C = 8; // within this of target = "good enough"
const TREND_WINDOW = 6; // samples used to estimate trend

export type SteerStatus = 'stable' | 'too_hot' | 'too_cold' | 'closing_in' | 'no_data';

export interface SteerAdvice {
  status: SteerStatus;
  headline: string;
  detail: string;
  suggestedBottom: number; // 0..1
  suggestedTop: number; // 0..1
  coalFill: string;
  bandLabel: string;
}

/** Pick the default band for a target temperature. */
export function bandForTarget(targetC: number): VentBand {
  return VENT_BANDS.find((b) => targetC <= b.maxC) ?? VENT_BANDS[VENT_BANDS.length - 1];
}

/** °C per minute over the recent window (positive = rising). */
export function trendPerMin(samples: TempSample[]): number | null {
  const pts = samples.filter((s) => s.ambientC != null).slice(-TREND_WINDOW);
  if (pts.length < 3) return null;
  const first = pts[0];
  const last = pts[pts.length - 1];
  const dMin = (last.t - first.t) / 60000;
  if (dMin <= 0) return null;
  return ((last.ambientC as number) - (first.ambientC as number)) / dMin;
}

/**
 * Closed-loop vent advice. The human is the actuator; we account for the
 * kamado's lag by reacting to trend, not just the current error, and we keep a
 * deadband so we don't nag. `learned` (if present) sets the baseline vent
 * positions for this target band instead of the generic defaults.
 */
export function getSteeringAdvice(
  targetC: number,
  currentAmbientC: number | null,
  samples: TempSample[],
  learned?: LearnedSetting
): SteerAdvice {
  const band = bandForTarget(targetC);
  const baseBottom = learned?.bottomVent ?? band.bottomVent;
  const baseTop = learned?.topVent ?? band.topVent;

  if (currentAmbientC == null) {
    return {
      status: 'no_data',
      headline: 'Geen omgevingstemp',
      detail:
        'Clip een probe op het rooster (niet in vlees) als omgevingsmeting, of vul de temp handmatig in.',
      suggestedBottom: baseBottom,
      suggestedTop: baseTop,
      coalFill: band.coalFill,
      bandLabel: band.label,
    };
  }

  const error = currentAmbientC - targetC; // + = too hot
  const trend = trendPerMin(samples); // °C/min, may be null

  // Approaching target fast from below: start pinching now (lag!).
  if (error < -DEADBAND_C && trend != null && trend > 1.5 && error > -25) {
    const nextTop = clamp01(baseTop - 0.15);
    return {
      status: 'closing_in',
      headline: 'Bijna op temp — begin met knijpen',
      detail: `Nog ${Math.abs(Math.round(error))}°C te gaan maar je stijgt snel (${trend.toFixed(
        1
      )}°C/min). Knijp de bovenklep vast iets dicht naar ${ventLabel(
        nextTop
      )}, anders schiet 'ie erover.`,
      suggestedBottom: baseBottom,
      suggestedTop: nextTop,
      coalFill: band.coalFill,
      bandLabel: band.label,
    };
  }

  if (Math.abs(error) <= DEADBAND_C) {
    return {
      status: 'stable',
      headline: `Stabiel op ${Math.round(currentAmbientC)}°C`,
      detail:
        trend != null && Math.abs(trend) > 1.2
          ? `Nog wat beweging (${trend.toFixed(1)}°C/min). Laat de kleppen staan en check over 10 min.`
          : 'Mooi in de buurt van je doel. Kleppen laten staan.',
      suggestedBottom: baseBottom,
      suggestedTop: baseTop,
      coalFill: band.coalFill,
      bandLabel: band.label,
    };
  }

  if (error > DEADBAND_C) {
    // Too hot — close the fine control (top) first, then the bottom.
    const step = error > 25 ? 0.3 : 0.15;
    const nextTop = clamp01(baseTop - step);
    const nextBottom = error > 25 ? clamp01(baseBottom - step) : baseBottom;
    return {
      status: 'too_hot',
      headline: `Te heet: ${Math.round(currentAmbientC)}°C (doel ${targetC}°C)`,
      detail: `Knijp de bovenklep naar ${ventLabel(nextTop)}${
        error > 25 ? ` en de onderschuif naar ${ventLabel(nextBottom)}` : ''
      }. Wacht 10 min voor je weer bijstelt — een kamado zakt traag.`,
      suggestedBottom: nextBottom,
      suggestedTop: nextTop,
      coalFill: band.coalFill,
      bandLabel: band.label,
    };
  }

  // Too cold — open the bottom (coarse) first.
  const step = error < -25 ? 0.3 : 0.15;
  const nextBottom = clamp01(baseBottom + step);
  const nextTop = error < -25 ? clamp01(baseTop + step) : baseTop;
  return {
    status: 'too_cold',
    headline: `Te koud: ${Math.round(currentAmbientC)}°C (doel ${targetC}°C)`,
    detail: `Zet de onderschuif open naar ${ventLabel(nextBottom)}${
      error < -25 ? ` en de bovenklep naar ${ventLabel(nextTop)}` : ''
    }. Deksel dicht houden en 10 min geven.`,
    suggestedBottom: nextBottom,
    suggestedTop: nextTop,
    coalFill: band.coalFill,
    bandLabel: band.label,
  };
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
