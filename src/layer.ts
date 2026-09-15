import { Group, type Object3D } from 'three';
import { AudioEngine, type AudioOptions } from './audio/engine.js';
import { FaultProcess } from './fault/process.js';
import { above, opens, strength } from './gates.js';
import { Haptics } from './page/haptics.js';
import { Jolter } from './page/jolt.js';
import { prefersReducedMotion } from './page/motion.js';
import { PageFlash } from './page/page-flash.js';
import { fork, mulberry32, type Rng } from './rng.js';
import { Arcs } from './sparks/arcs.js';
import { SparkEmitters } from './sparks/emitters.js';
import { ARC_TINT, Flashes, SPARK_TINT } from './sparks/flashes.js';
import { resolveTuning, type Tuning, type TuningOverrides } from './tuning.js';
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

export interface Fault {
  /** 0..1. The fault eases toward each new value over about 100 ms. */
  intensity: number;
  at: Vec3;
  to: Vec3 | null;
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

const MAX_STEP = 0.05;
const SILENT = 1e-3;

const clamp01 = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));
const arcDuration = (energy: number) => 0.05 + 0.17 * energy;

class FaultHandle implements Fault {
  readonly process: FaultProcess;
  at: Vec3;
  stopped = false;
  fizzCarry = 0;
  private landing: Vec3 | null = null;

  constructor(process: FaultProcess, spec: FaultSpec) {
    this.process = process;
    this.at = spec.at;
    this.to = spec.to ?? null;
    this.intensity = spec.intensity ?? 0;
  }

  get intensity(): number {
    return this.process.target;
  }

  set intensity(value: number) {
    if (!this.stopped) this.process.target = clamp01(value);
  }

  get to(): Vec3 | null {
    return this.landing;
  }

  set to(value: Vec3 | null) {
    this.landing = value;
    this.process.canArc = value !== null;
  }

  stop(): void {
    this.process.target = 0;
    this.stopped = true;
  }
}

class MagicLayer implements Layer {
  readonly object = new Group();
  readonly tuning: Tuning;
  private readonly rng: Rng;
  private readonly pageRng: Rng;
  private readonly emitters: SparkEmitters;
  private readonly arcs: Arcs;
  private readonly flashes: Flashes;
  private readonly audio: AudioEngine | null;
  private readonly jolter: Jolter | null;
  private readonly haptics: Haptics | null;
  private readonly pageFlash: PageFlash | null;
  private readonly faults = new Set<FaultHandle>();
  private readonly countScale: number;
  private readonly pan: (at: Vec3) => number;
  private readonly onDischarge: ((discharge: Discharge) => void) | undefined;
  private disposed = false;
  private quietVolume = 0.8;
  private quietMuted = false;

  constructor(options: LayerOptions) {
    this.rng = mulberry32(options.seed ?? Math.floor(Math.random() * 4294967296));
    this.pageRng = fork(this.rng);
    const scale = options.scale ?? 1;
    const reduced = options.reducedMotion !== 'ignore' && prefersReducedMotion();
    this.countScale = reduced ? 0.5 : 1;
    this.tuning = resolveTuning(options.tuning);
    this.emitters = new SparkEmitters({ scale, floor: options.floor ?? null });
    this.arcs = new Arcs(fork(this.rng), scale);
    this.flashes = new Flashes({ scale, lights: !reduced });
    this.object.add(this.emitters.object, this.arcs.object, this.flashes.object);
    const sound = options.sound ?? false;
    this.audio = sound
      ? new AudioEngine(sound === true ? {} : sound, fork(this.rng), this.tuning)
      : null;
    this.jolter = options.jolt && !reduced ? new Jolter(options.jolt) : null;
    this.haptics = options.haptics ? new Haptics() : null;
    this.pageFlash = options.pageFlash && !reduced ? new PageFlash() : null;
    this.pan = options.pan ?? (() => 0);
    this.onDischarge = options.onDischarge;
  }

  get live(): boolean {
    if (this.disposed) return false;
    return this.faulting || this.emitters.live || this.arcs.live || this.flashes.live;
  }

  /** A fault parked at zero is not live, so a host's frame loop can stop while it waits. */
  private get faulting(): boolean {
    for (const fault of this.faults) {
      if (fault.process.target > 0 || fault.process.level >= SILENT) return true;
    }
    return false;
  }

  get volume(): number {
    return this.audio ? this.audio.volume : this.quietVolume;
  }

  set volume(value: number) {
    if (this.audio) this.audio.volume = value;
    else this.quietVolume = value;
  }

  get muted(): boolean {
    return this.audio ? this.audio.muted : this.quietMuted;
  }

  set muted(value: boolean) {
    if (this.audio) this.audio.muted = value;
    else this.quietMuted = value;
  }

  setFloor(y: number | null): void {
    this.emitters.setFloor(y);
  }

  update(dt: number): void {
    if (this.disposed) return;
    const step = Math.min(Math.max(dt, 0), MAX_STEP);
    const t = this.tuning;
    let hum = 0;
    for (const fault of this.faults) {
      for (const draft of fault.process.step(step)) {
        const discharge: Discharge = {
          kind: draft.kind,
          at: { ...fault.at },
          energy: draft.energy,
          intensity: fault.process.level,
        };
        if (draft.kind === 'arc' && fault.to) {
          discharge.to = { ...fault.to };
          discharge.duration = arcDuration(draft.energy);
        }
        this.discharge(discharge);
      }
      const k = fault.process.level;
      fault.fizzCarry += above(k, t.fizz.from) * t.fizz.perSecond * step * this.countScale;
      const fizz = Math.floor(fault.fizzCarry);
      if (fizz > 0) {
        fault.fizzCarry -= fizz;
        this.emitters.spawn('fizz', fault.at, fizz);
        if (k > t.crackle.from) this.audio?.crackle(fizz, this.pan(fault.at));
      }
      hum = Math.max(hum, above(k, t.hum.from));
      if (fault.stopped && fault.process.level < SILENT) this.faults.delete(fault);
    }
    this.audio?.setHum(hum);
    this.emitters.retune(t.sparks);
    this.emitters.update(step);
    this.arcs.update(step);
    this.flashes.update(step);
  }

  sputter(at: Vec3, energy = 0.5): void {
    this.oneShot({ kind: 'sputter', at, energy: clamp01(energy) });
  }

  burst(at: Vec3, energy = 0.5): void {
    this.oneShot({ kind: 'burst', at, energy: clamp01(energy) });
  }

  shower(at: Vec3, energy = 0.5): void {
    this.oneShot({ kind: 'shower', at, energy: clamp01(energy) });
  }

  arc(from: Vec3, to: Vec3, energy = 0.5): void {
    const e = clamp01(energy);
    this.oneShot({ kind: 'arc', at: from, to, energy: e, duration: arcDuration(e) });
  }

  fault(spec: FaultSpec): Fault {
    const handle = new FaultHandle(new FaultProcess(fork(this.rng), this.tuning.fault), spec);
    if (!this.disposed) this.faults.add(handle);
    return handle;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.faults.clear();
    this.emitters.dispose();
    this.arcs.dispose();
    this.flashes.dispose();
    this.audio?.dispose();
    this.jolter?.dispose();
    this.pageFlash?.dispose();
    this.object.removeFromParent();
  }

  private oneShot(discharge: Discharge): void {
    if (!this.disposed) this.discharge(discharge);
  }

  private discharge(d: Discharge): void {
    const t = this.tuning;
    const sparks = opens(d, t.sparks.from);
    const count = this.countScale * t.sparks.count;
    const peaks = {
      glow: opens(d, t.glow.from) ? t.glow.peak : null,
      light: opens(d, t.lights.from) ? t.lights.peak : null,
    };
    if (d.kind === 'arc' && d.to) {
      if (opens(d, t.arcs.from)) {
        this.arcs.strike(d.at, d.to, d.energy, d.duration ?? arcDuration(d.energy));
      }
      const mid = { x: (d.at.x + d.to.x) / 2, y: (d.at.y + d.to.y) / 2, z: (d.at.z + d.to.z) / 2 };
      this.flashes.fire(mid, d.energy, ARC_TINT, peaks);
      if (sparks) {
        this.emitters.fire('sputter', d.at, d.energy / 2, count);
        this.emitters.fire('sputter', d.to, d.energy / 2, count);
      }
    } else if (d.kind !== 'arc') {
      if (sparks) this.emitters.fire(d.kind, d.at, d.energy, count);
      this.flashes.fire(d.at, d.energy, SPARK_TINT, peaks);
    }
    this.audio?.discharge(d, this.pan(d.at), {
      crackle: opens(d, t.crackle.from),
      buzz: opens(d, t.arcs.from),
      pop: opens(d, t.pops.from) ? strength(d, t.pops.from) : null,
    });
    if (opens(d, t.jolt.from)) {
      const jolt = strength(d, t.jolt.from);
      if (jolt > 0) this.jolter?.kick(jolt, this.pageRng, t.jolt.amplitude);
    }
    if (opens(d, t.haptics.from)) this.haptics?.pulse(d.energy);
    if (opens(d, t.pageFlash.from) && d.energy > t.pageFlash.energy) {
      this.pageFlash?.pulse(d.energy);
    }
    this.onDischarge?.(d);
  }
}

export function createLayer(options: LayerOptions = {}): Layer {
  return new MagicLayer(options);
}
