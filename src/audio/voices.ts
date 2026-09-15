import type { Rng } from '../rng.js';

const NOISE_SECONDS = 2;
/** Floor for exponential ramps, which cannot reach zero. */
const SILENT = 0.0001;
/** Time constant of the fade a voice cut by the cap takes. */
const STOP_FADE = 0.004;

const HUM_GAIN = 0.12;
const HUM_SQUARE_MIX = 0.35;
const HUM_BAND_HZ = 180;
const HUM_BAND_Q = 0.9;
/** [LFO hz, depth] pairs at incommensurate rates, so the flutter never audibly repeats. */
const HUM_FLUTTER: ReadonlyArray<readonly [number, number]> = [
  [0.37, 0.12],
  [1.91, 0.06],
];
const HUM_TIME_CONSTANT = 0.08;
const HUM_SAG_CENTS = -30;
const HUM_SAG_RECOVERY = 0.2;
const HUM_STOP_FADE = 0.02;

const CRACKLE_GAIN = 0.45;
const CRACKLE_CUTOFF = 3000;
const CLICK_MIN = 0.001;
const CLICK_MAX = 0.008;
const CLICK_ATTACK = 0.15;
const CLICK_FLOOR = 0.25;

const POP_GAIN = 0.7;
/** Makes up the level a Q 4 band-pass takes out of white noise. */
const POP_NOISE_BOOST = 2.5;
const POP_THUMP_MIX = 0.7;
const POP_NOISE_MIN = 0.005;
const POP_NOISE_MAX = 0.02;
/** Every pop draws its own sweep, sharpness, length and body from these ranges. */
const POP_SWEEP_FROM: Range = [1600, 4200];
const POP_SWEEP_TO: Range = [250, 800];
const POP_Q: Range = [2, 7];
const POP_LENGTH_SCALE: Range = [0.6, 1.6];
const POP_LEVEL_SCALE: Range = [0.6, 1];
const POP_ATTACK = 0.001;
const POP_THUMP_CHANCE = 0.65;
const POP_THUMP_HZ: Range = [45, 110];
const POP_THUMP_ATTACK = 0.002;
const POP_THUMP_DECAY: Range = [0.025, 0.075];
/** Some pops arc twice: a weaker second crack a moment after the first. */
const POP_ECHO_CHANCE = 0.22;
const POP_ECHO_DELAY: Range = [0.012, 0.042];
const POP_ECHO_LEVEL: Range = [0.3, 0.7];

const TAIL_GAIN = 0.35;
const TAIL_MIN = 20;
const TAIL_MAX = 60;
const TAIL_DELAY = 0.015;
const TAIL_SPAN = 0.6;
const TAIL_GROWTH = 1.08;
const TAIL_JITTER = 0.5;
const TAIL_FADE = 0.6;
const TAIL_PAN_SPREAD = 0.4;

const ARC_GAIN = 0.4;
const ARC_DRIVE = 8;
const ARC_CURVE_SIZE = 1024;
const ARC_BAND_HZ = 1200;
const ARC_BAND_Q = 1.2;
const ARC_HISS_CUTOFF = 5000;
const ARC_HISS_MIX = 0.35;
const ARC_RAMP = 0.003;
const ARC_DETUNE_CENTS = 8;

type Range = readonly [number, number];

const pick = ([low, high]: Range, rng: Rng) => low + (high - low) * rng();

export interface Voice {
  readonly peak: number;
  readonly end: number;
  stop(): void;
}

export interface Hum {
  setLevel(level: number, when: number): void;
  sag(when: number): void;
  stop(): void;
}

export interface VoiceOptions {
  noise: AudioBuffer;
  when: number;
  energy: number;
  pan: number;
  rng: Rng;
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

function clampPan(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(-1, value)) : 0;
}

export function crackleLevel(energy: number): number {
  return CRACKLE_GAIN * (0.4 + 0.6 * clamp01(energy));
}

export function popLevel(energy: number): number {
  return POP_GAIN * (0.35 + 0.65 * clamp01(energy));
}

function tailLevel(energy: number): number {
  return TAIL_GAIN * (0.4 + 0.6 * clamp01(energy));
}

export function showerLevel(energy: number): number {
  return Math.max(popLevel(energy), tailLevel(energy));
}

export function arcLevel(energy: number): number {
  return ARC_GAIN * (0.4 + 0.6 * clamp01(energy));
}

export function noiseBuffer(ctx: BaseAudioContext, rng: Rng, seconds = NOISE_SECONDS): AudioBuffer {
  const length = Math.max(1, Math.round(seconds * ctx.sampleRate));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = rng() * 2 - 1;
  return buffer;
}

/** One voice's nodes: parts → panner → out → destination, torn down when its last source ends. */
class Graph {
  readonly panner: StereoPannerNode;
  readonly out: GainNode;
  private readonly ctx: BaseAudioContext;
  private readonly nodes: AudioNode[] = [];
  private readonly sources: AudioScheduledSourceNode[] = [];
  private last: AudioScheduledSourceNode | null = null;
  private end = 0;

  constructor(ctx: BaseAudioContext, destination: AudioNode, pan: number) {
    this.ctx = ctx;
    this.out = this.add(new GainNode(ctx));
    this.panner = this.add(new StereoPannerNode(ctx, { pan: clampPan(pan) }));
    this.panner.connect(this.out).connect(destination);
  }

  add<T extends AudioNode>(node: T): T {
    this.nodes.push(node);
    return node;
  }

  track<T extends AudioScheduledSourceNode>(source: T, end: number): T {
    this.add(source);
    this.sources.push(source);
    if (end >= this.end) {
      this.end = end;
      this.last = source;
    }
    return source;
  }

  voice(peak: number): Voice {
    const { ctx, out, nodes, sources, end } = this;
    let released = false;
    let stopped = false;
    const release = (): void => {
      if (released) return;
      released = true;
      for (const node of nodes) node.disconnect();
    };
    if (this.last) this.last.onended = release;
    return {
      peak,
      end,
      stop() {
        if (stopped) return;
        stopped = true;
        try {
          const now = ctx.currentTime;
          out.gain.cancelScheduledValues(now);
          out.gain.setTargetAtTime(0, now, STOP_FADE);
          for (const source of sources) source.stop(now + STOP_FADE * 5);
        } catch {
          release();
        }
      },
    };
  }
}

interface Click {
  /** Seconds from the start of the buffer. */
  at: number;
  gain: number;
  pan: number;
}

/** Mixes enveloped noise slices into one buffer, so a burst of clicks costs one source node. */
function bakeClicks(
  ctx: BaseAudioContext,
  noise: AudioBuffer,
  rng: Rng,
  clicks: readonly Click[],
  seconds: number,
  stereo: boolean,
): AudioBuffer {
  const rate = ctx.sampleRate;
  const buffer = ctx.createBuffer(stereo ? 2 : 1, Math.max(1, Math.ceil(seconds * rate)), rate);
  const source = noise.getChannelData(0);
  const left = buffer.getChannelData(0);
  const right = stereo ? buffer.getChannelData(1) : null;
  for (const click of clicks) {
    const n = Math.max(2, Math.round((CLICK_MIN + rng() * (CLICK_MAX - CLICK_MIN)) * rate));
    const from = Math.floor(rng() * Math.max(1, source.length - n));
    const start = Math.max(0, Math.round(click.at * rate));
    const attack = Math.max(1, Math.round(n * CLICK_ATTACK));
    const angle = ((clampPan(click.pan) + 1) * Math.PI) / 4;
    const leftGain = right ? click.gain * Math.cos(angle) : click.gain;
    const rightGain = click.gain * Math.sin(angle);
    for (let i = 0; i < n; i++) {
      const k = start + i;
      if (k >= left.length) break;
      const envelope = i < attack ? i / attack : ((n - i) / (n - attack)) ** 2;
      const sample = (source[from + i] ?? 0) * envelope;
      left[k] = (left[k] ?? 0) + sample * leftGain;
      if (right) right[k] = (right[k] ?? 0) + sample * rightGain;
    }
  }
  return buffer;
}

function randomGain(level: number, rng: Rng): number {
  return level * (CLICK_FLOOR + (1 - CLICK_FLOOR) * rng());
}

export function createHum(ctx: BaseAudioContext, destination: AudioNode, mains: 50 | 60): Hum {
  const saw = new OscillatorNode(ctx, { type: 'sawtooth', frequency: 2 * mains });
  const square = new OscillatorNode(ctx, { type: 'square', frequency: 4 * mains });
  const squareMix = new GainNode(ctx, { gain: HUM_SQUARE_MIX });
  const band = new BiquadFilterNode(ctx, {
    type: 'bandpass',
    frequency: HUM_BAND_HZ,
    Q: HUM_BAND_Q,
  });
  const flutter = new GainNode(ctx, { gain: 1 });
  const level = new GainNode(ctx, { gain: 0 });
  saw.connect(band);
  square.connect(squareMix).connect(band);
  band.connect(flutter).connect(level).connect(destination);

  const oscillators: OscillatorNode[] = [saw, square];
  const nodes: AudioNode[] = [saw, square, squareMix, band, flutter, level];
  for (const [hz, depth] of HUM_FLUTTER) {
    const lfo = new OscillatorNode(ctx, { frequency: hz });
    const amount = new GainNode(ctx, { gain: depth });
    lfo.connect(amount).connect(flutter.gain);
    oscillators.push(lfo);
    nodes.push(lfo, amount);
  }
  const started = ctx.currentTime;
  for (const oscillator of oscillators) oscillator.start(started);

  let stopped = false;
  const release = (): void => {
    for (const node of nodes) node.disconnect();
  };
  return {
    setLevel(value, when) {
      if (stopped) return;
      level.gain.setTargetAtTime(HUM_GAIN * clamp01(value), when, HUM_TIME_CONSTANT);
    },
    sag(when) {
      if (stopped) return;
      for (const oscillator of [saw, square]) {
        oscillator.detune.cancelScheduledValues(when);
        oscillator.detune.setValueAtTime(HUM_SAG_CENTS, when);
        oscillator.detune.linearRampToValueAtTime(0, when + HUM_SAG_RECOVERY);
      }
    },
    stop() {
      if (stopped) return;
      stopped = true;
      try {
        const now = ctx.currentTime;
        level.gain.cancelScheduledValues(now);
        level.gain.setTargetAtTime(0, now, HUM_STOP_FADE);
        saw.onended = release;
        for (const oscillator of oscillators) oscillator.stop(now + HUM_STOP_FADE * 6);
      } catch {
        release();
      }
    },
  };
}

export function playCrackle(
  ctx: BaseAudioContext,
  destination: AudioNode,
  options: VoiceOptions & { count: number; spread: number },
): Voice {
  const { noise, when, energy, pan, rng } = options;
  const spread = Math.max(0, options.spread);
  const level = crackleLevel(energy);
  const clicks: Click[] = [];
  for (let i = 0; i < options.count; i++) {
    clicks.push({ at: rng() * spread, gain: randomGain(level, rng), pan: 0 });
  }
  const buffer = bakeClicks(ctx, noise, rng, clicks, spread + CLICK_MAX, false);
  const graph = new Graph(ctx, destination, pan);
  const source = graph.track(new AudioBufferSourceNode(ctx, { buffer }), when + buffer.duration);
  const highpass = graph.add(
    new BiquadFilterNode(ctx, { type: 'highpass', frequency: CRACKLE_CUTOFF }),
  );
  source.connect(highpass).connect(graph.panner);
  source.start(when);
  return graph.voice(level);
}

function addPop(
  ctx: BaseAudioContext,
  graph: Graph,
  noise: AudioBuffer,
  when: number,
  energy: number,
  rng: Rng,
  echo = true,
): void {
  const e = clamp01(energy);
  const level = popLevel(e) * pick(POP_LEVEL_SCALE, rng);
  const length =
    (POP_NOISE_MIN + (POP_NOISE_MAX - POP_NOISE_MIN) * e) * pick(POP_LENGTH_SCALE, rng);
  const from = pick(POP_SWEEP_FROM, rng);
  const to = pick(POP_SWEEP_TO, rng);
  const q = pick(POP_Q, rng);

  const burst = graph.track(new AudioBufferSourceNode(ctx, { buffer: noise }), when + length);
  const band = graph.add(new BiquadFilterNode(ctx, { type: 'bandpass', frequency: from, Q: q }));
  band.frequency.setValueAtTime(from, when);
  band.frequency.exponentialRampToValueAtTime(to, when + length);
  const burstGain = graph.add(new GainNode(ctx, { gain: 0 }));
  // A narrower band passes less of the noise, so the boost follows its sharpness.
  const boost = POP_NOISE_BOOST * Math.sqrt(q / 4);
  burstGain.gain.setValueAtTime(0, when);
  burstGain.gain.linearRampToValueAtTime(level * boost, when + POP_ATTACK);
  burstGain.gain.exponentialRampToValueAtTime(SILENT, when + length);
  burstGain.gain.setValueAtTime(0, when + length);
  burst.connect(band).connect(burstGain).connect(graph.panner);
  burst.start(when, rng() * Math.max(0, noise.duration - length), length);

  if (rng() < POP_THUMP_CHANCE) {
    const thumpEnd = when + pick(POP_THUMP_DECAY, rng);
    const thump = graph.track(
      new OscillatorNode(ctx, { type: 'sine', frequency: pick(POP_THUMP_HZ, rng) }),
      thumpEnd,
    );
    const thumpGain = graph.add(new GainNode(ctx, { gain: 0 }));
    thumpGain.gain.setValueAtTime(0, when);
    thumpGain.gain.linearRampToValueAtTime(level * POP_THUMP_MIX, when + POP_THUMP_ATTACK);
    thumpGain.gain.exponentialRampToValueAtTime(SILENT, thumpEnd);
    thumpGain.gain.setValueAtTime(0, thumpEnd);
    thump.connect(thumpGain).connect(graph.panner);
    thump.start(when);
    thump.stop(thumpEnd);
  }

  if (echo && rng() < POP_ECHO_CHANCE) {
    const later = when + pick(POP_ECHO_DELAY, rng);
    addPop(ctx, graph, noise, later, e * pick(POP_ECHO_LEVEL, rng), rng, false);
  }
}

export function playPop(
  ctx: BaseAudioContext,
  destination: AudioNode,
  options: VoiceOptions,
): Voice {
  const graph = new Graph(ctx, destination, options.pan);
  addPop(ctx, graph, options.noise, options.when, options.energy, options.rng);
  return graph.voice(popLevel(options.energy));
}

export function playShowerTail(
  ctx: BaseAudioContext,
  destination: AudioNode,
  options: VoiceOptions & { pop?: boolean },
): Voice {
  const { noise, when, pan, rng } = options;
  const energy = clamp01(options.energy);
  const graph = new Graph(ctx, destination, pan);
  if (options.pop ?? true) addPop(ctx, graph, noise, when, energy, rng);

  const count = Math.round(TAIL_MIN + (TAIL_MAX - TAIL_MIN) * energy);
  const gaps: number[] = [];
  let total = 0;
  for (let i = 0; i < count; i++) {
    const gap = TAIL_GROWTH ** i * (1 - TAIL_JITTER + 2 * TAIL_JITTER * rng());
    gaps.push(gap);
    total += gap;
  }
  const level = tailLevel(energy);
  const clicks: Click[] = [];
  let at = 0;
  for (const gap of gaps) {
    const fade = 1 - (TAIL_FADE * at) / TAIL_SPAN;
    const offset = (rng() * 2 - 1) * TAIL_PAN_SPREAD;
    clicks.push({ at, gain: randomGain(level, rng) * fade, pan: clampPan(pan) + offset });
    at += (gap / total) * TAIL_SPAN;
  }

  // Clicks are panned into the buffer itself, so the tail bypasses the voice's panner.
  const buffer = bakeClicks(ctx, noise, rng, clicks, TAIL_SPAN + CLICK_MAX, true);
  const start = when + TAIL_DELAY;
  const tail = graph.track(new AudioBufferSourceNode(ctx, { buffer }), start + buffer.duration);
  const highpass = graph.add(
    new BiquadFilterNode(ctx, { type: 'highpass', frequency: CRACKLE_CUTOFF }),
  );
  tail.connect(highpass).connect(graph.out);
  tail.start(start);
  return graph.voice(showerLevel(energy));
}

let tanhCurve: Float32Array<ArrayBuffer> | null = null;

function arcCurve(): Float32Array<ArrayBuffer> {
  if (!tanhCurve) {
    tanhCurve = new Float32Array(ARC_CURVE_SIZE);
    const norm = Math.tanh(ARC_DRIVE);
    for (let i = 0; i < ARC_CURVE_SIZE; i++) {
      const x = (i / (ARC_CURVE_SIZE - 1)) * 2 - 1;
      tanhCurve[i] = Math.tanh(ARC_DRIVE * x) / norm;
    }
  }
  return tanhCurve;
}

export function playArcBuzz(
  ctx: BaseAudioContext,
  destination: AudioNode,
  options: VoiceOptions & { duration: number; mains: 50 | 60 },
): Voice {
  const { noise, when, energy, pan, rng, mains } = options;
  const duration = Math.max(ARC_RAMP * 3, Number.isFinite(options.duration) ? options.duration : 0);
  const stopAt = when + duration;
  const level = arcLevel(energy);
  const graph = new Graph(ctx, destination, pan);

  const gate = graph.add(new GainNode(ctx, { gain: 0 }));
  gate.gain.setValueAtTime(0, when);
  gate.gain.linearRampToValueAtTime(level, when + ARC_RAMP);
  gate.gain.setValueAtTime(level, stopAt - ARC_RAMP);
  gate.gain.linearRampToValueAtTime(0, stopAt);
  gate.connect(graph.panner);

  const saw = graph.track(
    new OscillatorNode(ctx, {
      type: 'sawtooth',
      frequency: 2 * mains,
      detune: (rng() * 2 - 1) * ARC_DETUNE_CENTS,
    }),
    stopAt,
  );
  const shaper = graph.add(new WaveShaperNode(ctx, { curve: arcCurve(), oversample: '2x' }));
  const band = graph.add(
    new BiquadFilterNode(ctx, { type: 'bandpass', frequency: ARC_BAND_HZ, Q: ARC_BAND_Q }),
  );
  saw.connect(shaper).connect(band).connect(gate);

  const hiss = graph.track(new AudioBufferSourceNode(ctx, { buffer: noise, loop: true }), stopAt);
  const hissFilter = graph.add(
    new BiquadFilterNode(ctx, { type: 'highpass', frequency: ARC_HISS_CUTOFF }),
  );
  const hissGain = graph.add(new GainNode(ctx, { gain: ARC_HISS_MIX }));
  hiss.connect(hissFilter).connect(hissGain).connect(gate);

  saw.start(when);
  saw.stop(stopAt);
  hiss.start(when, rng() * noise.duration);
  hiss.stop(stopAt);
  return graph.voice(level);
}
