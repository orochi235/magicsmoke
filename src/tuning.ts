import { MEAN_GAP, MIN_GAP } from './audio/pop-gate.js';
import { DEFAULT_FAULT_TUNING, type FaultTuning } from './fault/tuning.js';

/**
 * Every effect a fault drives has a `from`: the fault intensity where it starts. Below it the effect
 * is off; above it, anything that scales with intensity ramps from zero at `from` to full at 1.
 * One-shots carry no intensity, so thresholds never hold them back.
 */
export interface Threshold {
  from: number;
}

export interface SparkTuning extends Threshold {
  /** Multipliers on every kind's particle count, size, speed and life. */
  count: number;
  size: number;
  speed: number;
  life: number;
}

export interface FizzTuning extends Threshold {
  /** Small sparks a second at full intensity, between discharges. */
  perSecond: number;
}

export type ArcTuning = Threshold;

export interface GlowTuning extends Threshold {
  /** Opacity of the glow at a full-energy discharge. */
  peak: number;
}

export interface LightTuning extends Threshold {
  /** Point-light intensity at a full-energy discharge, at one world unit per pixel. */
  peak: number;
}

export interface CrackleTuning extends Threshold {
  /** Multiplier on crackle, shower tails and fizz. */
  level: number;
}

export interface PopTuning extends Threshold {
  level: number;
  /** Share of full loudness a pop keeps at its threshold. */
  floor: number;
  /** Mean seconds between pops, whatever the discharge rate. */
  meanGap: number;
  minGap: number;
}

export interface HumTuning extends Threshold {
  level: number;
  /** How far the hum's level and pitch drift, growing with intensity. 0 holds it steady. */
  wobble: number;
}

/** Set by the host rather than a fault's intensity, so it has no `from`. */
export interface WhineTuning {
  level: number;
  /** Hz of the tone; its octave sounds above it. */
  pitch: number;
  /** Seconds the whine takes to fall silent once it is set back down. */
  fade: number;
}

export interface JoltTuning extends Threshold {
  /** CSS pixels at full strength. */
  amplitude: number;
}

export type HapticsTuning = Threshold;

export interface PageFlashTuning extends Threshold {
  /** Discharge energy a flash needs. */
  energy: number;
}

/** A blow is not gated by intensity, so it has no `from`. */
export interface BlowTuning {
  /** CSS pixels the element shakes at the climax. */
  shudder: number;
  /** Full-energy showers thrown at the climax. */
  showers: number;
  /** How many times faster the fault discharges at the climax. */
  surge: number;
}

export interface Tuning {
  fault: FaultTuning;
  blow: BlowTuning;
  sparks: SparkTuning;
  fizz: FizzTuning;
  arcs: ArcTuning;
  glow: GlowTuning;
  lights: LightTuning;
  crackle: CrackleTuning;
  pops: PopTuning;
  hum: HumTuning;
  whine: WhineTuning;
  jolt: JoltTuning;
  haptics: HapticsTuning;
  pageFlash: PageFlashTuning;
}

export type TuningGroup = keyof Tuning;

export type TuningOverrides = { [G in TuningGroup]?: Partial<Tuning[G]> };

export const DEFAULT_TUNING: Readonly<Tuning> = {
  fault: DEFAULT_FAULT_TUNING,
  blow: { shudder: 24, showers: 3, surge: 4 },
  sparks: { from: 0, count: 1, size: 1, speed: 1, life: 1 },
  fizz: { from: 0, perSecond: 4 },
  arcs: { from: 0 },
  glow: { from: 0, peak: 0.6 },
  lights: { from: 0, peak: 20000 },
  crackle: { from: 0, level: 1 },
  pops: { from: 0, level: 1, floor: 0.2, meanGap: MEAN_GAP, minGap: MIN_GAP },
  hum: { from: 0, level: 1, wobble: 1 },
  whine: { level: 1, pitch: 2400, fade: 0.8 },
  jolt: { from: 0, amplitude: 6 },
  haptics: { from: 0 },
  pageFlash: { from: 0, energy: 0.8 },
};

/** A complete tuning: the defaults with `overrides` laid over them, group by group. */
export function resolveTuning(overrides: TuningOverrides = {}): Tuning {
  const out = {} as Record<TuningGroup, object>;
  for (const group of Object.keys(DEFAULT_TUNING) as TuningGroup[]) {
    out[group] = { ...DEFAULT_TUNING[group], ...overrides[group] };
  }
  return out as Tuning;
}

/** How a lab should present one number: its range, its step, and what to call it. */
export interface ParamSpec {
  label: string;
  min: number;
  max: number;
  step: number;
  hint?: string;
}

export type TuningSchema = {
  [G in TuningGroup]: {
    label: string;
    params: { [P in keyof Tuning[G]]-?: ParamSpec };
  };
};

const from: ParamSpec = {
  label: 'Starts at intensity',
  min: 0,
  max: 1,
  step: 0.01,
  hint: 'Off below this fault intensity; one-shots ignore it.',
};

const multiplier = (label: string, max = 3): ParamSpec => ({ label, min: 0, max, step: 0.05 });

/** Plain data, so any lab can build its controls from it without depending on how this one does. */
export const TUNING_SCHEMA: TuningSchema = {
  fault: {
    label: 'Fault',
    params: {
      baseRate: { label: 'Base rate /s', min: 0, max: 5, step: 0.05 },
      rateCurve: { label: 'Rate curve (·k²) /s', min: 0, max: 30, step: 0.1 },
      exciteBoost: {
        label: 'Excite boost /s',
        min: 0,
        max: 6,
        step: 0.1,
        hint: 'With excite τ, the branching ratio; at 1 or more the rate runs away.',
      },
      exciteTau: { label: 'Excite τ s', min: 0.01, max: 0.6, step: 0.01 },
      easeTau: { label: 'Intensity ease τ s', min: 0.01, max: 1, step: 0.01 },
      energyPower: {
        label: 'Energy skew',
        min: 1,
        max: 16,
        step: 0.5,
        hint: 'Higher makes large discharges rarer.',
      },
      energyFloor: { label: 'Energy floor', min: 0, max: 1, step: 0.01 },
      energyGain: { label: 'Energy gain', min: 0, max: 1, step: 0.01 },
      energyLift: { label: 'Energy lift', min: 0, max: 0.5, step: 0.01 },
      sputterBelow: { label: 'Sputter below energy', min: 0, max: 1, step: 0.01 },
      burstBelow: { label: 'Burst below energy', min: 0, max: 1, step: 0.01 },
      arcFrom: { label: 'Arcs from energy', min: 0, max: 1, step: 0.01 },
      arcShare: { label: 'Arc share', min: 0, max: 1, step: 0.05 },
      showerCooldown: { label: 'Shower cooldown s', min: 0, max: 10, step: 0.1 },
    },
  },
  blow: {
    label: 'Blow',
    params: {
      shudder: { label: 'Shudder px at climax', min: 0, max: 60, step: 1 },
      showers: { label: 'Showers at climax', min: 0, max: 8, step: 1 },
      surge: { label: 'Discharge rate × at climax', min: 1, max: 10, step: 0.5 },
    },
  },
  sparks: {
    label: 'Sparks',
    params: {
      from,
      count: multiplier('Count ×'),
      size: multiplier('Size ×'),
      speed: multiplier('Speed ×'),
      life: multiplier('Life ×'),
    },
  },
  fizz: {
    label: 'Fizz',
    params: { from, perSecond: { label: 'Sparks /s at full', min: 0, max: 60, step: 1 } },
  },
  arcs: { label: 'Arcs', params: { from } },
  glow: {
    label: 'Glow',
    params: { from, peak: { label: 'Peak opacity', min: 0, max: 1, step: 0.01 } },
  },
  lights: {
    label: 'Lights',
    params: { from, peak: { label: 'Peak intensity', min: 0, max: 100000, step: 500 } },
  },
  crackle: { label: 'Crackle', params: { from, level: multiplier('Level ×', 2) } },
  pops: {
    label: 'Pops',
    params: {
      from,
      level: multiplier('Level ×', 2),
      floor: { label: 'Loudness at threshold', min: 0, max: 1, step: 0.01 },
      meanGap: { label: 'Mean gap s', min: 0.05, max: 5, step: 0.05 },
      minGap: { label: 'Min gap s', min: 0, max: 2, step: 0.01 },
    },
  },
  hum: {
    label: 'Hum',
    params: { from, level: multiplier('Level ×', 2), wobble: multiplier('Wobble ×', 3) },
  },
  whine: {
    label: 'Whine',
    params: {
      level: multiplier('Level ×', 2),
      pitch: { label: 'Pitch Hz', min: 400, max: 8000, step: 50 },
      fade: { label: 'Fade out s', min: 0.05, max: 3, step: 0.05 },
    },
  },
  jolt: {
    label: 'Jolt',
    params: { from, amplitude: { label: 'Amplitude px', min: 0, max: 30, step: 0.5 } },
  },
  haptics: { label: 'Haptics', params: { from } },
  pageFlash: {
    label: 'Page flash',
    params: { from, energy: { label: 'Needs energy', min: 0, max: 1, step: 0.01 } },
  },
};
