import type { Rng } from '../rng.js';
import type { DischargeKind } from '../types.js';

/** Mean seconds between pops, however fast the fault discharges. */
export const MEAN_GAP = 0.7;
/** No pop follows another sooner than this. */
export const MIN_GAP = 0.12;

export interface PopGaps {
  meanGap: number;
  minGap: number;
}

/**
 * Decides which discharges pop. Pops run on their own irregular clock, so a fault turned up gets
 * louder pops rather than more of them. A shower always pops and restarts the clock.
 */
export class PopGate {
  private readonly rng: Rng;
  private readonly gaps: PopGaps;
  private openAt = Number.NEGATIVE_INFINITY;

  /** `gaps` is read on every call, so a caller can retune it live. */
  constructor(rng: Rng, gaps: PopGaps = { meanGap: MEAN_GAP, minGap: MIN_GAP }) {
    this.rng = rng;
    this.gaps = gaps;
  }

  /** `now` is seconds on any clock that only moves forward. */
  allow(kind: DischargeKind, now: number): boolean {
    if (kind !== 'shower' && now < this.openAt) return false;
    const { meanGap, minGap } = this.gaps;
    // Exponential gaps past the minimum: irregular, with no beat to hear.
    const wait = -Math.log(1 - this.rng()) * Math.max(0, meanGap - minGap);
    this.openAt = now + minGap + wait;
    return true;
  }
}
