import type { Object3D } from 'three';
import { IntensityFault } from './alias.js';
import type { AudioOptions } from './audio/engine.js';
import { createSmoke, fault as cueFault, type Smoke } from './smoke.js';
import { clamp01 } from './stage.js';
import type { Tuning, TuningOverrides } from './tuning.js';
import type { Discharge, Vec3 } from './types.js';

export interface LayerOptions {
  /** Makes every fault's sequence of discharges repeatable. */
  seed?: number;
  /** World units per CSS pixel. Every speed and size is tuned in pixels. */
  scale?: number;
  /** World y that showers, sputter and fizz bounce off. */
  floor?: number | null;
  sound?: boolean | AudioOptions;
  /** Stereo position of a sound made at `at`, from -1 (left) to 1 (right). */
  pan?: (at: Vec3) => number;
  /** An element that jerks with each discharge. */
  jolt?: Element | null;
  haptics?: boolean;
  /** A full-page white pulse on the largest discharges. Off by default, for photosensitivity. */
  pageFlash?: boolean;
  reducedMotion?: 'respect' | 'ignore';
  /** Starting values for any effect's tuning; the rest are defaults. */
  tuning?: TuningOverrides;
  /** Called for every discharge, one-shots included, for a caller adding a channel of its own. */
  onDischarge?: (discharge: Discharge) => void;
}

export interface FaultSpec {
  at: Vec3;
  /** Where the fault's arcs land. Without it the fault never arcs. */
  to?: Vec3;
  intensity?: number;
}

export interface BlowSpec {
  /** Milliseconds from the call to the climax. Default 1000. */
  peak?: number;
  /** Milliseconds after the climax that the fault stays dead and ignores intensity. Default 300. */
  after?: number;
}

export interface Fault {
  /** 0..1. The fault eases toward each new value over about 100 ms. */
  intensity: number;
  at: Vec3;
  to: Vec3 | null;
  /**
   * Overloads the fault: it discharges ever faster and harder up to a climax at `peak`, throws a
   * volley of full-energy showers there, and goes dead on that frame. Intensity writes are ignored
   * until `after` more milliseconds have passed. Does nothing to a stopped fault or one already blowing.
   */
  blow(spec?: BlowSpec): void;
  /** Winds the fault down to silence, after which the layer forgets it. */
  stop(): void;
}

export interface Layer {
  /** Add this to the scene; it renders nothing until then. */
  readonly object: Object3D;
  /** Whether anything is still moving, lit, sounding or faulting. */
  readonly live: boolean;
  /** Every effect's tuning, read as it is used, so writes take effect at once. */
  readonly tuning: Tuning;
  volume: number;
  muted: boolean;
  /**
   * 0..1: a high ballast whine, as a tube makes while it strikes. It comes in at once and, set back
   * down, fades out over `tuning.whine.fade` seconds. It follows no fault; the host sets it.
   */
  whine: number;
  /** Moves the floor bouncing sparks land on; `null` removes it. */
  setFloor(y: number | null): void;
  /** Advances everything by `dt` seconds. Call it once a frame. */
  update(dt: number): void;
  sputter(at: Vec3, energy?: number): void;
  burst(at: Vec3, energy?: number): void;
  shower(at: Vec3, energy?: number): void;
  arc(from: Vec3, to: Vec3, energy?: number): void;
  fault(spec: FaultSpec): Fault;
  dispose(): void;
}

class LayerAlias implements Layer {
  private readonly smoke: Smoke;
  /** The clock `update` advances and hands to `sync`, in ms. */
  private clock = 0;

  constructor(options: LayerOptions) {
    this.smoke = createSmoke(options);
    // A fault cued before the first update counts that frame, as the old engine's did.
    this.smoke.sync(this.clock);
  }

  get object(): Object3D {
    return this.smoke.object;
  }

  get tuning(): Tuning {
    return this.smoke.tuning;
  }

  get live(): boolean {
    return this.smoke.live;
  }

  get volume(): number {
    return this.smoke.volume;
  }

  set volume(value: number) {
    this.smoke.volume = value;
  }

  get muted(): boolean {
    return this.smoke.muted;
  }

  set muted(value: boolean) {
    this.smoke.muted = value;
  }

  get whine(): number {
    return this.smoke.whine;
  }

  set whine(value: number) {
    this.smoke.whine = value;
  }

  setFloor(y: number | null): void {
    this.smoke.setFloor(y);
  }

  update(dt: number): void {
    this.clock += Math.max(0, Number.isFinite(dt) ? dt : 0) * 1000;
    this.smoke.sync(this.clock);
  }

  sputter(at: Vec3, energy?: number): void {
    this.smoke.sputter(at, energy);
  }

  burst(at: Vec3, energy?: number): void {
    this.smoke.burst(at, energy);
  }

  shower(at: Vec3, energy?: number): void {
    this.smoke.shower(at, energy);
  }

  arc(from: Vec3, to: Vec3, energy?: number): void {
    this.smoke.arc(from, to, energy);
  }

  fault(spec: FaultSpec): Fault {
    const handle = this.smoke.cue(cueFault({ at: spec.at, to: spec.to ?? null }), {
      weight: clamp01(spec.intensity ?? 0),
    });
    return new IntensityFault(handle, handle);
  }

  dispose(): void {
    this.smoke.dispose();
  }
}

/** The engine from before blits, now `createSmoke` behind its old interface. */
export function createLayer(options: LayerOptions = {}): Layer {
  return new LayerAlias(options);
}
