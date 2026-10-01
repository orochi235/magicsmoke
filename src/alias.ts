import type { BlowSpec } from './layer.js';
import { type FaultHandle, heldBy } from './smoke.js';
import { clamp01 } from './stage.js';

/** The handle the old API's faults wrap, in whichever coordinates that API takes. */
interface Cued<P> {
  weight: number;
  at: P;
  to: P | null;
  blow(spec?: BlowSpec): void;
  fade(): void;
}

/**
 * A blits fault behind the old `Fault` contract: `intensity` reads the target it is easing toward,
 * writes are dropped once stopped or while blowing, and a blow leaves it dead until written again.
 */
export class IntensityFault<P> {
  private readonly cued: Cued<P>;
  private readonly handle: FaultHandle;
  private stopped = false;

  constructor(cued: Cued<P>, handle: FaultHandle) {
    this.cued = cued;
    this.handle = handle;
  }

  get intensity(): number {
    return heldBy(this.handle).target;
  }

  set intensity(value: number) {
    if (this.stopped || heldBy(this.handle).blowing) return;
    this.cued.weight = clamp01(value);
  }

  get at(): P {
    return this.cued.at;
  }

  set at(value: P) {
    this.cued.at = value;
  }

  get to(): P | null {
    return this.cued.to;
  }

  set to(value: P | null) {
    this.cued.to = value;
  }

  blow(spec?: BlowSpec): void {
    if (this.stopped || heldBy(this.handle).blowing) return;
    this.cued.blow(spec);
    this.cued.weight = 0;
  }

  stop(): void {
    this.stopped = true;
    this.cued.fade();
  }
}
