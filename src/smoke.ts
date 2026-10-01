import {
  type FadeOptions,
  type Handle,
  kit,
  type Mix,
  mix,
  type Patch,
  patch,
  type VoiceSpec,
} from 'blits';
import type { Object3D } from 'three';
import { type Draft, FaultProcess, SUBSTEP } from './fault/process.js';
import type { BlowSpec, LayerOptions } from './layer.js';
import { clamp01, type FaultCore, MAX_STEP, SILENT, Stage } from './stage.js';
import type { Tuning } from './tuning.js';
import type { Vec3 } from './types.js';

/** What blits mixes for a fault: nothing. A fault's voice only steps its process and sends drafts. */
type Quiet = Record<never, never>;

const TAG = 'magicsmoke';
const NOTHING: Partial<Quiet> = {};

/** What a fault's voice reaches, as its weight signal and `weightOf` see it. */
export interface FaultSubject {
  readonly at: Vec3;
  readonly to: Vec3 | null;
}

/** One fault's state, and the subject its voice reaches. */
class FaultRecord implements FaultCore, FaultSubject {
  readonly process: FaultProcess;
  at: Vec3;
  fizzCarry = 0;
  blowing: FaultCore['blowing'] = null;
  /** True through the frame a blow ends: the old engine dropped intensity written before it. */
  holding = false;
  /** Set by `fade`: the target falls from `from` to 0 over `over` ms from `start`, which the first step after the call stamps on the mix clock. */
  fading: { from: number; start: number; over: number } | null = null;
  private landing: Vec3 | null = null;

  constructor(process: FaultProcess, at: Vec3, to: Vec3 | null) {
    this.process = process;
    this.at = at;
    this.to = to;
  }

  get to(): Vec3 | null {
    return this.landing;
  }

  set to(value: Vec3 | null) {
    this.landing = value;
    this.process.canArc = value !== null;
  }

  /** The target this fault's weight asks for at `timestamp`, unless a blow holds it. */
  aim(weight: number, timestamp: number): void {
    if (this.blowing || this.holding) return;
    const fading = this.fading;
    if (!fading) {
      this.process.target = clamp01(weight);
      return;
    }
    if (Number.isNaN(fading.start)) fading.start = timestamp;
    const left = fading.over > 0 ? 1 - (timestamp - fading.start) / fading.over : 0;
    this.process.target = fading.from * Math.max(0, left);
  }
}

const FAULT: Patch<FaultRecord, Quiet, void> = patch<FaultRecord, Quiet>(0, () => NOTHING, {
  writes: [],
  step(_state, _dt, record, setting) {
    record.aim(setting.weight, setting.timestamp);
    const draft = record.process.tick();
    if (draft) setting.send(draft);
  },
});

/** Where a fault sits and where its arcs land; `smoke.cue` plays it. */
export interface FaultPatch {
  readonly at: Vec3;
  readonly to: Vec3 | null;
}

export function fault(spec: { at: Vec3; to?: Vec3 | null }): FaultPatch {
  return { at: spec.at, to: spec.to ?? null };
}

/** How a fault plays: blits' voice spec, less what magicsmoke decides itself. */
export type FaultCue = Omit<
  VoiceSpec<FaultSubject, Quiet>,
  'patch' | 'target' | 'locus' | 'from' | 'loop' | 'stagger'
>;

/** A fault's live controls: blits' handle, plus where it sits and its overload. */
export interface FaultHandle extends Handle<FaultSubject> {
  at: Vec3;
  to: Vec3 | null;
  /** See `Fault.blow`. The weight is ignored until the blow is over, then followed again. */
  blow(spec?: BlowSpec): void;
  /**
   * Takes the intensity to zero over `over` ms (default: the cue's `fade.out`, else at once), lets
   * the fault wind down to silence, and then removes it.
   */
  fade(opts?: Pick<FadeOptions, 'over'>): void;
}

class Fault implements FaultHandle {
  readonly record: FaultRecord;
  private readonly inner: Handle<FaultRecord>;
  private readonly owner: SmokeEngine;
  private readonly fadeOut: number;

  constructor(record: FaultRecord, inner: Handle<FaultRecord>, owner: SmokeEngine, fadeOut = 0) {
    this.record = record;
    this.inner = inner;
    this.owner = owner;
    this.fadeOut = fadeOut;
  }

  get id(): number {
    return this.inner.id;
  }

  get state(): Handle['state'] {
    const state = this.inner.state;
    return this.record.fading && state !== 'done' ? 'fading' : state;
  }

  get weight(): number {
    return this.inner.weight;
  }

  set weight(value: number) {
    this.inner.weight = value;
    // So `live` answers before the next sync, as an intensity write always has.
    if (!this.record.fading) this.record.aim(value, 0);
  }

  get rate(): number {
    return this.inner.rate;
  }

  set rate(value: number) {
    this.inner.rate = value;
  }

  get done(): Promise<void> {
    return this.inner.done;
  }

  get at(): Vec3 {
    return this.record.at;
  }

  set at(value: Vec3) {
    this.record.at = value;
  }

  get to(): Vec3 | null {
    return this.record.to;
  }

  set to(value: Vec3 | null) {
    this.record.to = value;
  }

  seek(elapsed: number): void {
    this.inner.seek(elapsed);
  }

  weightOf(subject: FaultSubject): number {
    return subject instanceof FaultRecord ? this.inner.weightOf(subject) : 0;
  }

  blow(spec: BlowSpec = {}): void {
    if (this.record.fading || this.record.blowing) return;
    this.owner.blow(this.record, spec);
  }

  fade(opts: Pick<FadeOptions, 'over'> = {}): void {
    if (this.record.fading || this.inner.state === 'done') return;
    const { process } = this.record;
    this.record.blowing = null;
    process.surge = 1;
    process.lift = 0;
    const over = Math.max(0, opts.over ?? this.fadeOut);
    this.record.fading = { from: process.target, start: Number.NaN, over };
    if (over === 0) process.target = 0;
  }

  /** Called once the fault is silent after a fade. */
  retire(): void {
    this.inner.fade({ over: 0 });
  }
}

/** magicsmoke on blits: each fault a voice on a private mix, stepped every 5 ms. */
export interface Smoke {
  /** Add this to the scene; it renders nothing until then. */
  readonly object: Object3D;
  /** Whether anything is still moving, lit, sounding or faulting. */
  readonly live: boolean;
  /** Every effect's tuning, read as it is used, so writes take effect at once. */
  readonly tuning: Tuning;
  volume: number;
  muted: boolean;
  /** See `Layer.whine`. */
  whine: number;
  setFloor(y: number | null): void;
  /** Plays a fault. Its weight is its intensity: a number, or any blits signal. */
  cue(fault: FaultPatch, spec?: FaultCue): FaultHandle;
  /** The host reports the clock, in ms on the rAF clock, once a frame; everything advances to it. */
  sync(timestamp: number): void;
  /** The time until the next sync is not to count: call it when a hidden tab comes back. */
  rebase(): void;
  sputter(at: Vec3, energy?: number): void;
  burst(at: Vec3, energy?: number): void;
  shower(at: Vec3, energy?: number): void;
  arc(from: Vec3, to: Vec3, energy?: number): void;
  dispose(): void;
}

class SmokeEngine implements Smoke {
  private readonly stage: Stage;
  private readonly mix: Mix<FaultRecord, Quiet>;
  private readonly faults = new Map<FaultRecord, Fault>();
  /** The last synced timestamp; NaN before the first sync and after a rebase. */
  private last = Number.NaN;

  constructor(options: LayerOptions) {
    this.stage = new Stage(options);
    this.mix = mix<FaultRecord, Quiet>(kit<Quiet>({}), {
      stepMs: SUBSTEP * 1000,
      maxDt: MAX_STEP * 1000,
    });
  }

  get object(): Object3D {
    return this.stage.object;
  }

  get tuning(): Tuning {
    return this.stage.tuning;
  }

  get live(): boolean {
    if (this.stage.disposed) return false;
    for (const record of this.faults.keys()) {
      if (record.process.target > 0 || record.process.level >= SILENT) return true;
    }
    return this.stage.drawing;
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

  cue(patch: FaultPatch, spec: FaultCue = {}): FaultHandle {
    const record = new FaultRecord(
      new FaultProcess(this.stage.fork(), this.tuning.fault),
      patch.at,
      patch.to,
    );
    const inner = this.mix.cue({
      // The process counts the frame before its first advance, so its grid starts at the last sync.
      start: Number.isNaN(this.last) ? undefined : this.last,
      ...(spec as VoiceSpec<FaultRecord, Quiet>),
      tags: [TAG, ...(spec.tags ?? [])],
      patch: FAULT,
      target: (subject) => subject === record,
    });
    const handle = new Fault(record, inner, this, spec.fade?.out);
    if (typeof spec.weight === 'number' || spec.weight === undefined) {
      record.aim(spec.weight ?? 1, 0);
    }
    if (!this.stage.disposed) this.faults.set(record, handle);
    return handle;
  }

  blow(record: FaultRecord, spec: BlowSpec): void {
    this.stage.blow(record, spec);
  }

  sync(timestamp: number): void {
    if (this.stage.disposed) return;
    const gap = Number.isNaN(this.last) ? 0 : timestamp - this.last;
    const step = Math.min(Math.max(gap / 1000, 0), MAX_STEP);
    this.last = timestamp;
    this.mix.sync(timestamp);
    for (const [record, handle] of this.faults) {
      if (record.blowing) {
        this.stage.advanceBlow(record, step);
        record.holding = record.blowing === null;
      }
      this.mix.probe(record);
      record.holding = false;
      // Drained per fault, so each fault's discharges render together, in the order the old
      // engine renders them; the page's random stream is shared and order decides its draws.
      for (const sent of this.mix.drain<Draft>(TAG)) this.stage.draft(record, sent.event);
      this.stage.settle(record, step);
      if (record.fading && record.process.target === 0 && record.process.level < SILENT) {
        handle.retire();
        this.mix.drop(record);
        this.faults.delete(record);
      }
    }
    this.stage.advance(step);
  }

  rebase(): void {
    this.mix.rebase();
    this.last = Number.NaN;
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

  dispose(): void {
    if (this.stage.disposed) return;
    this.mix.mute({ over: 0 });
    this.faults.clear();
    this.stage.dispose();
  }
}

export function createSmoke(options: LayerOptions = {}): Smoke {
  return new SmokeEngine(options);
}
