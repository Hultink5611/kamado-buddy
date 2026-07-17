import type { LearnedSetting, TempSample } from './types';
import { bandForTarget } from './steering';

const STABLE_DEADBAND_C = 6;
const STABLE_MINUTES = 10;

/** True when ambient has hovered within a tight band of target long enough. */
export function isStable(
  samples: TempSample[],
  targetC: number,
  minutes = STABLE_MINUTES
): boolean {
  const now = samples[samples.length - 1]?.t ?? 0;
  const window = samples.filter(
    (s) => s.ambientC != null && now - s.t <= minutes * 60000
  );
  if (window.length < 4) return false;
  const spanOk = now - window[0].t >= minutes * 60000 * 0.8;
  const inBand = window.every(
    (s) => Math.abs((s.ambientC as number) - targetC) <= STABLE_DEADBAND_C
  );
  return spanOk && inBand;
}

export function getLearnedForTarget(
  list: LearnedSetting[],
  targetC: number
): LearnedSetting | undefined {
  const band = bandForTarget(targetC);
  return list.find((l) => l.bandMaxC === band.maxC);
}

/**
 * Fold a newly-observed stable setting into the learned store. Values are
 * exponentially smoothed so one weird cook doesn't wreck the baseline.
 */
export function upsertLearned(
  list: LearnedSetting[],
  targetC: number,
  appliedBottom: number,
  appliedTop: number,
  observedAmbientC: number,
  now: number
): LearnedSetting[] {
  const band = bandForTarget(targetC);
  const existing = list.find((l) => l.bandMaxC === band.maxC);
  if (!existing) {
    return [
      ...list,
      {
        bandMaxC: band.maxC,
        bottomVent: appliedBottom,
        topVent: appliedTop,
        observedAmbientC,
        updatedAt: now,
        samples: 1,
      },
    ];
  }
  const a = 0.4; // smoothing toward the new observation
  const merged: LearnedSetting = {
    ...existing,
    bottomVent: existing.bottomVent * (1 - a) + appliedBottom * a,
    topVent: existing.topVent * (1 - a) + appliedTop * a,
    observedAmbientC: existing.observedAmbientC * (1 - a) + observedAmbientC * a,
    updatedAt: now,
    samples: existing.samples + 1,
  };
  return list.map((l) => (l.bandMaxC === band.maxC ? merged : l));
}
