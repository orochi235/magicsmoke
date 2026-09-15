import type { DischargeKind } from '../types.js';
import { DEFAULT_FAULT_TUNING, type FaultTuning } from './tuning.js';

/** `u` is uniform on [0, 1); a high power makes most discharges small and a rare few large. */
export function drawEnergy(u: number, k: number, t: FaultTuning = DEFAULT_FAULT_TUNING): number {
  return Math.min(1, u ** t.energyPower * (t.energyFloor + t.energyGain * k) + t.energyLift * k);
}

export function kindFor(
  energy: number,
  canArc: boolean,
  u: number,
  t: FaultTuning = DEFAULT_FAULT_TUNING,
): DischargeKind {
  if (canArc && energy >= t.arcFrom && u < t.arcShare) return 'arc';
  if (energy < t.sputterBelow) return 'sputter';
  return energy < t.burstBelow ? 'burst' : 'shower';
}
