import type { Rng } from '../rng.js';
import type { DischargeKind } from '../types.js';
import { drawEnergy, kindFor } from './energy.js';
import { DEFAULT_FAULT_TUNING, type FaultTuning } from './tuning.js';

export interface Draft {
  kind: DischargeKind;
  energy: number;
  /** Seconds since the process started. */
  time: number;
}

const SUBSTEP = 0.005;
const MAX_STEP = 0.05;
const SILENT = 1e-3;

/** When a fault discharges and how hard, with no rendering or sound attached. */
export class FaultProcess {
  target = 0;
  canArc = false;
  private readonly rng: Rng;
  private readonly tuning: FaultTuning;
  private eased = 0;
  private excitation = 0;
  private elapsed = 0;
  private ticks = 0;
  private showerReady = 0;

  constructor(rng: Rng, tuning: FaultTuning = DEFAULT_FAULT_TUNING) {
    this.rng = rng;
    this.tuning = tuning;
  }

  get level(): number {
    return this.eased;
  }

  get now(): number {
    return this.ticks * SUBSTEP;
  }

  step(dt: number): Draft[] {
    const t = this.tuning;
    const drafts: Draft[] = [];
    this.elapsed += Math.min(Math.max(dt, 0), MAX_STEP);
    // Substeps count from the start of the process rather than per call, so a seed produces the
    // same sequence however the caller chunks its frames.
    const due = Math.floor(this.elapsed / SUBSTEP + 1e-6);
    const follow = 1 - Math.exp(-SUBSTEP / t.easeTau);
    const decay = Math.exp(-SUBSTEP / t.exciteTau);
    while (this.ticks < due) {
      this.ticks++;
      this.eased += (this.target - this.eased) * follow;
      const k = this.eased;
      if (k >= SILENT) {
        const rate = t.baseRate + t.rateCurve * k * k + this.excitation;
        if (this.rng() < 1 - Math.exp(-rate * SUBSTEP)) {
          const energy = drawEnergy(this.rng(), k, t);
          const now = this.ticks * SUBSTEP;
          let kind = kindFor(energy, this.canArc, this.rng(), t);
          // A shower lands harder for being rare, so one due inside the cooldown is a burst.
          if (kind === 'shower') {
            if (now < this.showerReady) kind = 'burst';
            else this.showerReady = now + t.showerCooldown;
          }
          drafts.push({ kind, energy, time: now });
          this.excitation += t.exciteBoost;
        }
      }
      this.excitation *= decay;
    }
    return drafts;
  }
}
