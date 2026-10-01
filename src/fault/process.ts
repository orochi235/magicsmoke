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

/** Seconds per substep. */
export const SUBSTEP = 0.005;
const SILENT = 1e-3;

/** When a fault discharges and how hard, with no rendering or sound attached. */
export class FaultProcess {
  target = 0;
  canArc = false;
  /** Multiplies the discharge rate before excitation. */
  surge = 1;
  /** Added to every discharge's energy, before the cap at 1. */
  lift = 0;
  private readonly rng: Rng;
  private readonly tuning: FaultTuning;
  private eased = 0;
  private excitation = 0;
  private ticks = 0;
  private showerReady = 0;

  constructor(rng: Rng, tuning: FaultTuning = DEFAULT_FAULT_TUNING) {
    this.rng = rng;
    this.tuning = tuning;
  }

  get level(): number {
    return this.eased;
  }

  /** Dark and silent at once, skipping the ease a write to `target` would follow. */
  snuff(): void {
    this.target = 0;
    this.eased = 0;
    this.excitation = 0;
    this.surge = 1;
    this.lift = 0;
  }

  get now(): number {
    return this.ticks * SUBSTEP;
  }

  /** One substep of `SUBSTEP` seconds: eases, maybe discharges, and decays the excitation. */
  tick(): Draft | null {
    const t = this.tuning;
    this.ticks++;
    this.eased += (this.target - this.eased) * (1 - Math.exp(-SUBSTEP / t.easeTau));
    const k = this.eased;
    let draft: Draft | null = null;
    if (k >= SILENT) {
      const rate = (t.baseRate + t.rateCurve * k * k) * this.surge + this.excitation;
      if (this.rng() < 1 - Math.exp(-rate * SUBSTEP)) {
        const energy = Math.min(1, drawEnergy(this.rng(), k, t) + this.lift);
        const now = this.ticks * SUBSTEP;
        let kind = kindFor(energy, this.canArc, this.rng(), t);
        // A shower lands harder for being rare, so one due inside the cooldown is a burst.
        if (kind === 'shower') {
          if (now < this.showerReady) kind = 'burst';
          else this.showerReady = now + t.showerCooldown;
        }
        draft = { kind, energy, time: now };
        this.excitation += t.exciteBoost;
      }
    }
    this.excitation *= Math.exp(-SUBSTEP / t.exciteTau);
    return draft;
  }
}
