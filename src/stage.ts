import { Group } from 'three';
import { AudioEngine } from './audio/engine.js';
import type { Draft, FaultProcess } from './fault/process.js';
import { above, opens, strength } from './gates.js';
import type { BlowSpec, LayerOptions } from './layer.js';
import { Haptics } from './page/haptics.js';
import { Jolter } from './page/jolt.js';
import { prefersReducedMotion } from './page/motion.js';
import { PageFlash } from './page/page-flash.js';
import { fork, mulberry32, type Rng } from './rng.js';
import { Arcs } from './sparks/arcs.js';
import { SparkEmitters } from './sparks/emitters.js';
import { ARC_TINT, Flashes, SPARK_TINT } from './sparks/flashes.js';
import { resolveTuning, type Tuning } from './tuning.js';
import type { Discharge, Vec3 } from './types.js';

/** The most seconds one frame advances anything by. */
export const MAX_STEP = 0.05;
export const SILENT = 1e-3;
/** Energy a blow adds to every discharge by its climax. */
const BLOW_LIFT = 0.3;

export const clamp01 = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));
const arcDuration = (energy: number) => 0.05 + 0.17 * energy;
const seconds = (ms: number | undefined, fallback: number) =>
  Math.max(0, ms !== undefined && Number.isFinite(ms) ? ms : fallback) / 1000;

interface Blowing {
  /** Seconds since the blow began, from then to the climax, and from the climax to the blow's end. */
  elapsed: number;
  peak: number;
  after: number;
  climaxed: boolean;
}

/** What a fault is to the stage, whichever engine steps its process. */
export interface FaultCore {
  readonly process: FaultProcess;
  at: Vec3;
  readonly to: Vec3 | null;
  fizzCarry: number;
  blowing: Blowing | null;
}

/** Everything a fault drives, apart from stepping its process: rendering, sound and the page. */
export class Stage {
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
  private readonly countScale: number;
  private readonly pan: (at: Vec3) => number;
  private readonly onDischarge: ((discharge: Discharge) => void) | undefined;
  disposed = false;
  private quietVolume = 0.8;
  private quietMuted = false;
  private whineLevel = 0;
  private hum = 0;

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

  /** A stream for a new fault's process, forked in the order faults are made. */
  fork(): Rng {
    return fork(this.rng);
  }

  /** Whether anything is still moving or lit; faults answer for themselves. */
  get drawing(): boolean {
    return this.emitters.live || this.arcs.live || this.flashes.live;
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

  get whine(): number {
    return this.whineLevel;
  }

  set whine(value: number) {
    this.whineLevel = clamp01(value);
    if (!this.disposed) this.audio?.setWhine(this.whineLevel);
  }

  setFloor(y: number | null): void {
    this.emitters.setFloor(y);
  }

  /** Starts a blow on a fault that is not already blowing, and shudders the element toward it. */
  blow(fault: FaultCore, spec: BlowSpec): void {
    const peak = seconds(spec.peak, 1000);
    fault.blowing = { elapsed: 0, peak, after: seconds(spec.after, 300), climaxed: false };
    fault.process.target = 1;
    if (this.disposed) return;
    const { jolt, blow } = this.tuning;
    this.jolter?.shudder(peak, jolt.amplitude, blow.shudder, this.pageRng);
  }

  /** Surges the fault toward its climax, throws the volley there, then holds it dead for `after`. */
  advanceBlow(fault: FaultCore, step: number): void {
    const blow = fault.blowing;
    if (!blow) return;
    const { process } = fault;
    blow.elapsed += step;
    if (!blow.climaxed) {
      const u = blow.peak > 0 ? Math.min(1, blow.elapsed / blow.peak) : 1;
      process.surge = 1 + (this.tuning.blow.surge - 1) * u * u;
      process.lift = BLOW_LIFT * u * u;
      if (blow.elapsed < blow.peak) return;
      blow.climaxed = true;
      process.snuff();
      for (let i = 0; i < this.tuning.blow.showers; i++) {
        this.oneShot({ kind: 'shower', at: { ...fault.at }, energy: 1 });
      }
      this.oneShot({ kind: 'burst', at: { ...fault.at }, energy: 1 });
      if (fault.to) {
        const to = { ...fault.to };
        this.oneShot({ kind: 'arc', at: { ...fault.at }, to, energy: 1, duration: arcDuration(1) });
      }
    }
    if (blow.elapsed >= blow.peak + blow.after) fault.blowing = null;
  }

  /** Renders what a fault's process drafted. */
  draft(fault: FaultCore, draft: Draft): void {
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

  /** A fault's between-discharge fizz and its share of the hum, once a frame. */
  settle(fault: FaultCore, step: number): void {
    const t = this.tuning;
    const k = fault.process.level;
    fault.fizzCarry += above(k, t.fizz.from) * t.fizz.perSecond * step * this.countScale;
    const fizz = Math.floor(fault.fizzCarry);
    if (fizz > 0) {
      fault.fizzCarry -= fizz;
      this.emitters.spawn('fizz', fault.at, fizz);
      if (k > t.crackle.from) this.audio?.crackle(fizz, this.pan(fault.at));
    }
    this.hum = Math.max(this.hum, above(k, t.hum.from));
  }

  /** Ends the frame: sets the hum every fault settled toward and moves everything drawn. */
  advance(step: number): void {
    this.audio?.setHum(this.hum);
    this.hum = 0;
    this.emitters.retune(this.tuning.sparks);
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

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
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
