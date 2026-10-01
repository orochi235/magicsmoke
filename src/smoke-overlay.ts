import { WebGLRenderer } from 'three';
import { Canvas, type OverlayOptions, toClient, toWorld, viewportPan } from './overlay.js';
import { createSmoke, type FaultCue, type FaultHandle, fault, type Smoke } from './smoke.js';
import { resolveTuning, type Tuning } from './tuning.js';
import type { Point } from './types.js';

/** A fault on the overlay: `FaultHandle` in client coordinates. */
export interface OverlaySmokeFault extends Omit<FaultHandle, 'at' | 'to'> {
  at: Point;
  to: Point | null;
}

/** `createOverlay` on the blits engine: faults are cued, and the loop syncs from rAF. */
export interface SmokeOverlay {
  /** False where WebGL is unavailable; every call is then a no-op. */
  readonly supported: boolean;
  readonly live: boolean;
  readonly tuning: Tuning;
  volume: number;
  muted: boolean;
  whine: number;
  sputter(at: Point, energy?: number): void;
  burst(at: Point, energy?: number): void;
  shower(at: Point, energy?: number): void;
  arc(from: Point, to: Point, energy?: number): void;
  cue(spec: { at: Point; to?: Point | null }, cue?: FaultCue): OverlaySmokeFault;
  /** Advances to `timestamp` and draws one frame, for a host running its own loop (`loop: false`). */
  sync(timestamp: number): void;
  dispose(): void;
}

class Wrapped implements OverlaySmokeFault {
  private readonly inner: FaultHandle;
  private readonly wake: () => void;

  constructor(inner: FaultHandle, wake: () => void) {
    this.inner = inner;
    this.wake = wake;
  }

  get id() {
    return this.inner.id;
  }

  get state() {
    return this.inner.state;
  }

  get done() {
    return this.inner.done;
  }

  get weight() {
    return this.inner.weight;
  }

  set weight(value: number) {
    this.inner.weight = value;
    this.wake();
  }

  get rate() {
    return this.inner.rate;
  }

  set rate(value: number) {
    this.inner.rate = value;
  }

  get at(): Point {
    return toClient(this.inner.at);
  }

  set at(point: Point) {
    this.inner.at = toWorld(point);
  }

  get to(): Point | null {
    return this.inner.to ? toClient(this.inner.to) : null;
  }

  set to(point: Point | null) {
    this.inner.to = point ? toWorld(point) : null;
    this.wake();
  }

  seek(elapsed: number): void {
    this.inner.seek(elapsed);
  }

  weightOf(subject: Parameters<FaultHandle['weightOf']>[0]): number {
    return this.inner.weightOf(subject);
  }

  blow(spec?: Parameters<FaultHandle['blow']>[0]): void {
    this.inner.blow(spec);
    this.wake();
  }

  fade(opts?: Parameters<FaultHandle['fade']>[0]): void {
    this.inner.fade(opts);
    this.wake();
  }
}

class Inert implements SmokeOverlay {
  readonly supported = false;
  readonly live = false;
  readonly tuning: Tuning = resolveTuning();
  volume = 0.8;
  muted = false;
  whine = 0;
  sputter(): void {}
  burst(): void {}
  shower(): void {}
  arc(): void {}
  cue(spec: { at: Point; to?: Point | null }): OverlaySmokeFault {
    return new Wrapped(
      createSmoke().cue(fault({ ...spec, at: toWorld(spec.at), to: null })),
      () => {},
    );
  }
  sync(): void {}
  dispose(): void {}
}

class SmokeCanvas extends Canvas implements SmokeOverlay {
  private readonly smoke: Smoke;
  /** Faults whose weight is a signal: it can rise with nobody calling, so the loop keeps running. */
  private readonly listening = new Set<FaultHandle>();
  private drew = false;

  constructor(renderer: WebGLRenderer, options: OverlayOptions) {
    super(renderer, options);
    this.smoke = createSmoke({ ...options, scale: 1, floor: null, pan: viewportPan });
    this.mount(this.smoke);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  get live(): boolean {
    return this.smoke.live;
  }

  get tuning(): Tuning {
    return this.smoke.tuning;
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

  sputter(at: Point, energy?: number): void {
    this.smoke.sputter(toWorld(at), energy);
    this.wake();
  }

  burst(at: Point, energy?: number): void {
    this.smoke.burst(toWorld(at), energy);
    this.wake();
  }

  shower(at: Point, energy?: number): void {
    this.smoke.shower(toWorld(at), energy);
    this.wake();
  }

  arc(from: Point, to: Point, energy?: number): void {
    this.smoke.arc(toWorld(from), toWorld(to), energy);
    this.wake();
  }

  cue(spec: { at: Point; to?: Point | null }, cue: FaultCue = {}): OverlaySmokeFault {
    const inner = this.smoke.cue(
      fault({ at: toWorld(spec.at), to: spec.to ? toWorld(spec.to) : null }),
      cue,
    );
    if (typeof cue.weight === 'function') {
      this.listening.add(inner);
      const forget = () => this.listening.delete(inner);
      inner.done.then(forget, forget);
    }
    this.wake();
    return new Wrapped(inner, this.wake);
  }

  sync(timestamp: number): void {
    if (this.disposed) return;
    this.smoke.sync(timestamp);
    // A canvas with nothing on it stays cleared, so a frame that would draw nothing is skipped.
    const live = this.smoke.live;
    if (live || this.drew) this.renderer.render(this.scene, this.camera);
    this.drew = live;
  }

  override dispose(): void {
    document.removeEventListener('visibilitychange', this.onVisibility);
    super.dispose();
  }

  protected frameAt(now: number): void {
    this.sync(now);
  }

  protected get awake(): boolean {
    return this.smoke.live || this.listening.size > 0;
  }

  private readonly onVisibility = () => {
    if (!document.hidden) this.smoke.rebase();
  };
}

/** A transparent canvas over the viewport, drawing faults on the blits engine in client coordinates. */
export function createSmokeOverlay(options: OverlayOptions = {}): SmokeOverlay {
  if (typeof document === 'undefined') return new Inert();
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ alpha: true, antialias: true });
  } catch {
    return new Inert();
  }
  return new SmokeCanvas(renderer, options);
}
