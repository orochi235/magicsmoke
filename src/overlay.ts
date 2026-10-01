import { IntensityFault } from './alias.js';
import type { BlowSpec, LayerOptions } from './layer.js';
import { createSmokeOverlay, type SmokeOverlay, unwrap } from './smoke-overlay.js';
import { resolveTuning, type Tuning } from './tuning.js';
import type { Point } from './types.js';

export interface OverlayOptions extends Omit<LayerOptions, 'scale' | 'floor' | 'pan'> {
  /** Client y that bouncing sparks land on. Defaults to the bottom of the viewport; `null` for none. */
  floor?: number | null;
  /** Runs a frame loop while anything is live. `false` leaves drawing to `render(dt)`. */
  loop?: boolean;
}

export interface OverlayFaultSpec {
  at: Point;
  to?: Point;
  intensity?: number;
}

export interface OverlayFault {
  intensity: number;
  at: Point;
  to: Point | null;
  /** See `Fault.blow`. */
  blow(spec?: BlowSpec): void;
  stop(): void;
}

export interface Overlay {
  /** False where WebGL is unavailable; every call is then a no-op. */
  readonly supported: boolean;
  readonly live: boolean;
  /** Every effect's tuning, read as it is used, so writes take effect at once. */
  readonly tuning: Tuning;
  volume: number;
  muted: boolean;
  /** See `Layer.whine`. */
  whine: number;
  sputter(at: Point, energy?: number): void;
  burst(at: Point, energy?: number): void;
  shower(at: Point, energy?: number): void;
  arc(from: Point, to: Point, energy?: number): void;
  fault(spec: OverlayFaultSpec): OverlayFault;
  /** Advances by `dt` seconds and draws one frame. */
  render(dt: number): void;
  dispose(): void;
}

class InertFault implements OverlayFault {
  intensity = 0;
  at: Point;
  to: Point | null;

  constructor(spec: OverlayFaultSpec) {
    this.at = spec.at;
    this.to = spec.to ?? null;
  }

  blow(): void {}
  stop(): void {}
}

class Unsupported implements Overlay {
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
  fault(spec: OverlayFaultSpec): OverlayFault {
    return new InertFault(spec);
  }
  render(): void {}
  dispose(): void {}
}

class OverlayAlias implements Overlay {
  readonly supported = true;
  private readonly smoke: SmokeOverlay;
  /** The clock `render` advances and hands to `sync`, in ms. */
  private clock = 0;

  constructor(smoke: SmokeOverlay) {
    this.smoke = smoke;
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
    this.smoke.sputter(at, energy);
  }

  burst(at: Point, energy?: number): void {
    this.smoke.burst(at, energy);
  }

  shower(at: Point, energy?: number): void {
    this.smoke.shower(at, energy);
  }

  arc(from: Point, to: Point, energy?: number): void {
    this.smoke.arc(from, to, energy);
  }

  fault(spec: OverlayFaultSpec): OverlayFault {
    const cued = this.smoke.cue(
      { at: spec.at, to: spec.to ?? null },
      { weight: Math.min(1, Math.max(0, spec.intensity ?? 0)) },
    );
    return new IntensityFault(cued, unwrap(cued));
  }

  render(dt: number): void {
    this.clock += Math.max(0, Number.isFinite(dt) ? dt : 0) * 1000;
    this.smoke.sync(this.clock);
  }

  dispose(): void {
    this.smoke.dispose();
  }
}

/**
 * A transparent canvas over the viewport, drawing faults in client coordinates: `createSmokeOverlay`
 * behind the interface it had before blits.
 */
export function createOverlay(options: OverlayOptions = {}): Overlay {
  const smoke = createSmokeOverlay(options);
  return smoke.supported ? new OverlayAlias(smoke) : new Unsupported();
}
