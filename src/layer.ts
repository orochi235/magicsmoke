import type { Object3D } from 'three';
import type { AudioOptions } from './audio/engine.js';
import { FaultProcess } from './fault/process.js';
import { clamp01, type FaultCore, MAX_STEP, SILENT, Stage } from './stage.js';
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

class FaultHandle implements Fault, FaultCore {
  readonly process: FaultProcess;
  at: Vec3;
  stopped = false;
  fizzCarry = 0;
  blowing: FaultCore['blowing'] = null;
  private landing: Vec3 | null = null;
  private readonly stage: Stage;

  constructor(process: FaultProcess, spec: FaultSpec, stage: Stage) {
    this.process = process;
    this.stage = stage;
    this.at = spec.at;
    this.to = spec.to ?? null;
    this.intensity = spec.intensity ?? 0;
  }

  get intensity(): number {
    return this.process.target;
  }

  set intensity(value: number) {
    if (!this.stopped && !this.blowing) this.process.target = clamp01(value);
  }

  blow(spec: BlowSpec = {}): void {
    if (this.stopped || this.blowing) return;
    this.stage.blow(this, spec);
  }

  get to(): Vec3 | null {
    return this.landing;
  }

  set to(value: Vec3 | null) {
    this.landing = value;
    this.process.canArc = value !== null;
  }

  stop(): void {
    this.blowing = null;
    this.process.surge = 1;
    this.process.lift = 0;
    this.process.target = 0;
    this.stopped = true;
  }
}

class MagicLayer implements Layer {
  private readonly stage: Stage;
  private readonly faults = new Set<FaultHandle>();

  constructor(options: LayerOptions) {
    this.stage = new Stage(options);
  }

  get object(): Object3D {
    return this.stage.object;
  }

  get tuning(): Tuning {
    return this.stage.tuning;
  }

  get live(): boolean {
    if (this.stage.disposed) return false;
    return this.faulting || this.stage.drawing;
  }

  /** A fault parked at zero is not live, so a host's frame loop can stop while it waits. */
  private get faulting(): boolean {
    for (const fault of this.faults) {
      if (fault.process.target > 0 || fault.process.level >= SILENT) return true;
    }
    return false;
  }

  get volume(): number {
    return this.stage.volume;
  }

  set volume(value: number) {
    this.stage.volume = value;
  }

  get muted(): boolean {
    return this.stage.muted;
  }

  set muted(value: boolean) {
    this.stage.muted = value;
  }

  get whine(): number {
    return this.stage.whine;
  }

  set whine(value: number) {
    this.stage.whine = value;
  }

  setFloor(y: number | null): void {
    this.stage.setFloor(y);
  }

  update(dt: number): void {
    if (this.stage.disposed) return;
    const step = Math.min(Math.max(dt, 0), MAX_STEP);
    for (const fault of this.faults) {
      if (fault.blowing) this.stage.advanceBlow(fault, step);
      for (const draft of fault.process.step(step)) this.stage.draft(fault, draft);
      this.stage.settle(fault, step);
      if (fault.stopped && fault.process.level < SILENT) this.faults.delete(fault);
    }
    this.stage.advance(step);
  }

  sputter(at: Vec3, energy?: number): void {
    this.stage.sputter(at, energy);
  }

  burst(at: Vec3, energy?: number): void {
    this.stage.burst(at, energy);
  }

  shower(at: Vec3, energy?: number): void {
    this.stage.shower(at, energy);
  }

  arc(from: Vec3, to: Vec3, energy?: number): void {
    this.stage.arc(from, to, energy);
  }

  fault(spec: FaultSpec): Fault {
    const handle = new FaultHandle(
      new FaultProcess(this.stage.fork(), this.tuning.fault),
      spec,
      this.stage,
    );
    if (!this.stage.disposed) this.faults.add(handle);
    return handle;
  }

  dispose(): void {
    if (this.stage.disposed) return;
    this.faults.clear();
    this.stage.dispose();
  }
}

export function createLayer(options: LayerOptions = {}): Layer {
  return new MagicLayer(options);
}
