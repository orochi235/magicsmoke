import { fork, type Rng } from '../rng.js';
import { DEFAULT_TUNING, type Tuning } from '../tuning.js';
import type { Discharge } from '../types.js';
import { VoiceCap } from './cap.js';
import { PopGate } from './pop-gate.js';
import {
  arcLevel,
  crackleLevel,
  createHum,
  type Hum,
  noiseBuffer,
  playArcBuzz,
  playCrackle,
  playPop,
  playShowerTail,
  popLevel,
  showerLevel,
  type Voice,
} from './voices.js';

const DEFAULT_VOLUME = 0.8;
const DEFAULT_MAINS = 60;
const MAX_VOICES = 24;
/** Scheduling lead past `currentTime`, so a voice's first ramp is never in the past. */
const LEAD = 0.005;
const FRAME = 0.016;
const VOLUME_TIME_CONSTANT = 0.015;
const LIMITER: DynamicsCompressorOptions = {
  threshold: -6,
  ratio: 20,
  attack: 0.002,
  release: 0.1,
  knee: 0,
};
const SAG_ENERGY = 0.6;
const ARC_DURATION = 0.12;
const SPUTTER_MIN = 3;
const SPUTTER_MAX = 8;
const SPUTTER_SPREAD = 0.04;
/** Clicks a burst that does not pop crackles with instead. */
const BURST_CRACKLE = 10;
const FIZZ_ENERGY = 0.35;
/** The hum drifts on two random walks, one for level and one for pitch, stepped once a frame. */
const HUM_DRIFT_STEP = 0.35;
const HUM_DRIFT_PULL = 0.08;
/** At full intensity and full wobble, the level swings this share either way, the pitch this many cents. */
const HUM_SWELL = 0.55;
const HUM_WARBLE_CENTS = 35;
const FIZZ_MAX = 16;
const RELEASE_SLACK_MS = 50;
const GESTURES = ['pointerdown', 'keydown', 'touchend'] as const;

/** Which sounds a discharge may make, decided by each effect's threshold. */
export interface AudioGate {
  crackle: boolean;
  buzz: boolean;
  /** Pop strength past its threshold, or `null` while pops are below it. */
  pop: number | null;
}

export type AudioTuning = Pick<Tuning, 'crackle' | 'pops' | 'hum'>;

export interface AudioOptions {
  volume?: number;
  muted?: boolean;
  mains?: 50 | 60;
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

function settle(promise: Promise<void>): void {
  promise.catch(() => undefined);
}

export class AudioEngine {
  private readonly rng: Rng;
  private readonly mains: 50 | 60;
  private readonly cap = new VoiceCap(MAX_VOICES);
  private readonly pops: PopGate;
  private readonly tuning: AudioTuning;
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private hum: Hum | null = null;
  private humLevel = 0;
  private humSwell = 0;
  private humWarble = 0;
  private level: number;
  private silenced: boolean;
  private listening = false;
  private disposed = false;

  private readonly onGesture = (): void => {
    this.unlock();
    const ctx = this.ctx;
    if (ctx?.state === 'suspended' && !document.hidden) settle(ctx.resume());
    this.unlisten();
  };

  private readonly onVisibility = (): void => {
    const ctx = this.ctx;
    if (!ctx || ctx.state === 'closed') return;
    settle(document.hidden ? ctx.suspend() : ctx.resume());
  };

  /** `tuning` is read as each sound is made, so a caller can retune it live. */
  constructor(options: AudioOptions, rng: Rng, tuning: AudioTuning = DEFAULT_TUNING) {
    this.rng = fork(rng);
    this.tuning = tuning;
    this.pops = new PopGate(this.rng, tuning.pops);
    this.level = Number.isFinite(options.volume)
      ? Math.max(0, options.volume ?? 0)
      : DEFAULT_VOLUME;
    this.silenced = options.muted ?? false;
    this.mains = options.mains ?? DEFAULT_MAINS;
    if (typeof AudioContext === 'undefined' || typeof window === 'undefined') return;
    if (typeof navigator !== 'undefined' && navigator.userActivation?.hasBeenActive) {
      this.unlock();
      // A context created outside a gesture can still start suspended; the next gesture resumes it.
      if (this.ctx?.state !== 'suspended') return;
    }
    for (const type of GESTURES) window.addEventListener(type, this.onGesture, true);
    this.listening = true;
  }

  get unlocked(): boolean {
    return this.ctx !== null;
  }

  get volume(): number {
    return this.level;
  }

  set volume(value: number) {
    if (!Number.isFinite(value)) return;
    this.level = Math.max(0, value);
    this.applyGain();
  }

  get muted(): boolean {
    return this.silenced;
  }

  set muted(value: boolean) {
    this.silenced = value;
    this.applyGain();
  }

  /** Plays the discharge's sound; dropped (not queued) before unlock. pan is -1..1. */
  discharge(d: Discharge, pan: number, gate?: AudioGate): void {
    const { ctx, master, noise } = this;
    if (!ctx || !master || !noise) return;
    const when = ctx.currentTime + LEAD;
    const energy = clamp01(d.energy);
    const base = { noise, when, pan, rng: this.rng };
    const { crackle, pops } = this.tuning;
    const crackles = gate?.crackle ?? true;
    const buzzes = gate?.buzz ?? true;
    const popStrength = gate ? gate.pop : clamp01(d.intensity ?? energy);
    // Pops keep their own clock and follow the fault's intensity, so turning a fault up makes them
    // louder rather than more frequent.
    const pop = popStrength !== null && this.pops.allow(d.kind, when);
    const loud = pops.floor + (1 - pops.floor) * (popStrength ?? 0);
    const gain = crackle.level;
    switch (d.kind) {
      case 'sputter': {
        if (!crackles) break;
        const count = Math.round(SPUTTER_MIN + (SPUTTER_MAX - SPUTTER_MIN) * energy);
        this.play(crackleLevel(energy) * gain, () =>
          playCrackle(ctx, master, { ...base, energy, count, spread: SPUTTER_SPREAD, gain }),
        );
        break;
      }
      case 'burst':
        if (!pop && crackles) {
          this.play(crackleLevel(energy) * gain, () =>
            playCrackle(ctx, master, {
              ...base,
              energy,
              count: BURST_CRACKLE,
              spread: SPUTTER_SPREAD,
              gain,
            }),
          );
        }
        break;
      case 'shower':
        if (crackles) {
          this.play(showerLevel(energy) * gain, () =>
            playShowerTail(ctx, master, { ...base, energy, pop: false, gain }),
          );
        }
        break;
      case 'arc': {
        if (!buzzes) break;
        const duration = d.duration ?? ARC_DURATION;
        const mains = this.mains;
        this.play(arcLevel(energy), () =>
          playArcBuzz(ctx, master, { ...base, energy, duration, mains }),
        );
        break;
      }
    }
    if (pop) {
      this.play(popLevel(loud) * pops.level, () =>
        playPop(ctx, master, { ...base, energy: loud, gain: pops.level }),
      );
    }
    if (energy > SAG_ENERGY) this.hum?.sag(when);
  }

  /** Fizz between discharges: `count` crackle clicks over the next frame (~16 ms). */
  crackle(count: number, pan: number): void {
    const { ctx, master, noise } = this;
    if (!ctx || !master || !noise) return;
    const clicks = Math.min(FIZZ_MAX, Math.floor(Number.isFinite(count) ? count : 0));
    if (clicks <= 0) return;
    const options = {
      noise,
      when: ctx.currentTime + LEAD,
      energy: FIZZ_ENERGY,
      pan,
      rng: this.rng,
      count: clicks,
      spread: FRAME,
      gain: this.tuning.crackle.level,
    };
    this.play(crackleLevel(FIZZ_ENERGY) * options.gain, () => playCrackle(ctx, master, options));
  }

  /** 0..1, the loudest live fault's intensity; the hum starts on the first non-zero level. */
  setHum(level: number): void {
    const intensity = clamp01(level);
    const value = intensity * this.tuning.hum.level;
    this.humLevel = value;
    const { ctx, master } = this;
    if (!ctx || !master) return;
    if (!this.hum) {
      if (value === 0) return;
      this.hum = createHum(ctx, master, this.mains);
    }
    // Squared, so a gentle fault barely wavers and a fault flat out surges and warbles.
    const depth = (intensity * this.tuning.hum.wobble) ** 2;
    this.humSwell = this.drift(this.humSwell);
    this.humWarble = this.drift(this.humWarble);
    const now = ctx.currentTime;
    this.hum.setLevel(value * (1 + HUM_SWELL * depth * this.humSwell), now);
    this.hum.wobble(HUM_WARBLE_CENTS * depth * this.humWarble, now);
  }

  private drift(walk: number): number {
    const next = walk + (this.rng() - 0.5) * HUM_DRIFT_STEP - walk * HUM_DRIFT_PULL;
    return Math.min(1, Math.max(-1, next));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unlisten();
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    const ctx = this.ctx;
    if (!ctx) return;
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.hum?.stop();
    this.hum = null;
    settle(ctx.close());
    this.ctx = null;
    this.master = null;
    this.noise = null;
  }

  private unlock(): void {
    if (this.disposed || this.ctx) return;
    let ctx: AudioContext;
    try {
      ctx = new AudioContext();
    } catch {
      return;
    }
    const limiter = new DynamicsCompressorNode(ctx, LIMITER);
    const master = new GainNode(ctx, { gain: this.silenced ? 0 : this.level });
    master.connect(limiter).connect(ctx.destination);
    this.ctx = ctx;
    this.master = master;
    this.noise = noiseBuffer(ctx, this.rng);
    document.addEventListener('visibilitychange', this.onVisibility);
    if (document.hidden) settle(ctx.suspend());
    if (this.humLevel > 0) this.setHum(this.humLevel);
  }

  private unlisten(): void {
    if (!this.listening) return;
    this.listening = false;
    for (const type of GESTURES) window.removeEventListener(type, this.onGesture, true);
  }

  private applyGain(): void {
    const { ctx, master } = this;
    if (!ctx || !master) return;
    const target = this.silenced ? 0 : this.level;
    master.gain.setTargetAtTime(target, ctx.currentTime, VOLUME_TIME_CONSTANT);
  }

  /** Admits by level before building the graph; frees the slot once the voice falls silent. */
  private play(peak: number, build: () => Voice): void {
    const ctx = this.ctx;
    if (!ctx) return;
    let voice: Voice | null = null;
    const ticket = this.cap.admit(peak, () => voice?.stop());
    if (!ticket) return;
    try {
      voice = build();
    } catch {
      this.cap.release(ticket);
      return;
    }
    const delay = Math.max(0, (voice.end - ctx.currentTime) * 1000) + RELEASE_SLACK_MS;
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      this.cap.release(ticket);
    }, delay);
    this.timers.add(timer);
  }
}
