export interface Tuning {
  /** A fault at intensity k discharges at `baseRate + rateCurve·k²` per second before excitation. */
  baseRate: number;
  rateCurve: number;
  /** Per-second rate each discharge adds, decaying over `exciteTau` seconds. */
  exciteBoost: number;
  exciteTau: number;
  /** Time constant, in seconds, for intensity to follow a new value. */
  easeTau: number;
  /** Energy is `u³·(energyFloor + energyGain·k) + energyLift·k`, capped at 1. */
  energyFloor: number;
  energyGain: number;
  energyLift: number;
  sputterBelow: number;
  burstBelow: number;
  /** A fault that can arc turns `arcShare` of its discharges at or above `arcFrom` into arcs. */
  arcFrom: number;
  arcShare: number;
  /** Small sparks a second a fault at intensity 1 fizzes between discharges. */
  fizzPerSecond: number;
}

/**
 * `exciteBoost · exciteTau` is the branching ratio. At 0.5 the long-run rate is about twice the
 * base rate; at 1 or above the process runs away.
 */
export const DEFAULT_TUNING: Readonly<Tuning> = {
  baseRate: 0.5,
  rateCurve: 11.5,
  exciteBoost: 3.3,
  exciteTau: 0.15,
  easeTau: 0.1,
  energyFloor: 0.35,
  energyGain: 0.65,
  energyLift: 0.1,
  sputterBelow: 0.25,
  burstBelow: 0.6,
  arcFrom: 0.45,
  arcShare: 0.5,
  fizzPerSecond: 20,
};
