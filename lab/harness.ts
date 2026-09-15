import { AudioEngine } from '../src/audio/engine.js';
import {
  createHum,
  noiseBuffer,
  playArcBuzz,
  playCrackle,
  playPop,
  playShowerTail,
} from '../src/audio/voices.js';
import { createOverlay } from '../src/overlay.js';
import { mulberry32 } from '../src/rng.js';

export type VoiceName = 'pop' | 'crackle' | 'shower' | 'arc' | 'hum';

export interface VoiceReport {
  peak: number;
  rms: number;
  lastAudible: number;
  expectedEnd: number;
}

export interface PixelReport {
  supported: boolean;
  lit: number;
  overAlpha: number;
  cornerAlpha: number;
}

const RATE = 44100;
const SECONDS = 1.5;

async function renderVoice(name: VoiceName, energy: number): Promise<VoiceReport> {
  const ctx = new OfflineAudioContext(2, RATE * SECONDS, RATE);
  const rng = mulberry32(1);
  const base = { noise: noiseBuffer(ctx, rng), when: 0.01, energy, pan: 0, rng };
  let expectedEnd = SECONDS;
  if (name === 'pop') expectedEnd = playPop(ctx, ctx.destination, base).end;
  if (name === 'crackle') {
    expectedEnd = playCrackle(ctx, ctx.destination, { ...base, count: 8, spread: 0.05 }).end;
  }
  if (name === 'shower') expectedEnd = playShowerTail(ctx, ctx.destination, base).end;
  if (name === 'arc') {
    expectedEnd = playArcBuzz(ctx, ctx.destination, { ...base, duration: 0.2, mains: 60 }).end;
  }
  if (name === 'hum') createHum(ctx, ctx.destination, 60).setLevel(1, 0);

  const buffer = await ctx.startRendering();
  let peak = 0;
  let sum = 0;
  let lastAudible = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i++) {
      const v = Math.abs(data[i] ?? 0);
      peak = Math.max(peak, v);
      sum += v * v;
      if (v > 1e-3) lastAudible = Math.max(lastAudible, i / RATE);
    }
  }
  return {
    peak,
    rms: Math.sqrt(sum / (buffer.length * buffer.numberOfChannels)),
    lastAudible,
    expectedEnd,
  };
}

function pixels(canvas: HTMLCanvasElement): Omit<PixelReport, 'supported'> {
  const gl = canvas.getContext('webgl2');
  if (!gl) throw new Error('no webgl2 context on the overlay canvas');
  const { drawingBufferWidth: w, drawingBufferHeight: h } = gl;
  const px = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  let lit = 0;
  let overAlpha = 0;
  for (let i = 0; i < px.length; i += 4) {
    const color = Math.max(px[i] ?? 0, px[i + 1] ?? 0, px[i + 2] ?? 0);
    const alpha = px[i + 3] ?? 0;
    if (alpha > 0) lit++;
    if (color > alpha + 1) overAlpha++;
  }
  const corner = (x: number, y: number) => px[(y * w + x) * 4 + 3] ?? 0;
  const cornerAlpha = Math.max(
    corner(0, 0),
    corner(w - 1, 0),
    corner(0, h - 1),
    corner(w - 1, h - 1),
  );
  return { lit, overAlpha, cornerAlpha };
}

/** A seeded burst in the middle of the viewport, eight frames on, read back before compositing. */
function renderBurst(): PixelReport {
  const overlay = createOverlay({ seed: 1, loop: false });
  if (!overlay.supported) return { supported: false, lit: 0, overAlpha: 0, cornerAlpha: 0 };
  overlay.burst({ x: innerWidth / 2, y: innerHeight / 2 }, 1);
  for (let i = 0; i < 8; i++) overlay.render(1 / 60);
  const canvas = document.querySelector<HTMLCanvasElement>('canvas.magicsmoke-overlay');
  if (!canvas) throw new Error('overlay canvas missing');
  const report = pixels(canvas);
  overlay.dispose();
  return { supported: true, ...report };
}

/** A fault at full intensity for a second: the largest lit area seen in any frame. */
function renderFault(): PixelReport {
  const overlay = createOverlay({ seed: 2, loop: false });
  if (!overlay.supported) return { supported: false, lit: 0, overAlpha: 0, cornerAlpha: 0 };
  overlay.fault({ at: { x: innerWidth / 2, y: innerHeight / 3 }, intensity: 1 });
  const canvas = document.querySelector<HTMLCanvasElement>('canvas.magicsmoke-overlay');
  if (!canvas) throw new Error('overlay canvas missing');
  let best = { lit: 0, overAlpha: 0, cornerAlpha: 0 };
  for (let i = 0; i < 60; i++) {
    overlay.render(1 / 60);
    const report = pixels(canvas);
    if (report.lit > best.lit) best = report;
  }
  overlay.dispose();
  return { supported: true, ...best };
}

// Built at load rather than inside a test's `evaluate`, which Playwright runs as a user gesture.
const engine = new AudioEngine({}, mulberry32(3));

const harness = {
  renderVoice,
  renderBurst,
  renderFault,
  /** Fires a discharge at the page's engine and reports whether audio has unlocked. */
  engineUnlocked(): boolean {
    engine.discharge({ kind: 'burst', at: { x: 0, y: 0, z: 0 }, energy: 1 }, 0);
    return engine.unlocked;
  },
};

export type Harness = typeof harness;

declare global {
  interface Window {
    harness: Harness;
  }
}

window.harness = harness;
