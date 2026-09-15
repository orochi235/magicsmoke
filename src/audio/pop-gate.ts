import type { Rng } from '../rng.js';
import type { DischargeKind } from '../types.js';

/** Mean seconds between pops, however fast the fault discharges. */
export const MEAN_GAP = 0.7;
/** No pop follows another sooner than this. */
export const MIN_GAP = 0.12;

/**
 * Decides which discharges pop. Pops run on their own irregular clock, so a fault turned up gets
 * louder pops rather than more of them. A shower always pops and restarts the clock.
 */
export class PopGate {
  private readonly rng: Rng;
  private openAt = Number.NEGATIVE_INFINITY;

  constructor(rng: Rng) {
    this.rng = rng;
  }

  /** `now` is seconds on any clock that only moves forward. */
  allow(kind: DischargeKind, now: number): boolean {
    if (kind !== 'shower' && now < this.openAt) return false;
    // Exponential gaps past the minimum: irregular, with no beat to hear.
    const wait = -Math.log(1 - this.rng()) * (MEAN_GAP - MIN_GAP);
    this.openAt = now + MIN_GAP + wait;
    return true;
  }
}
