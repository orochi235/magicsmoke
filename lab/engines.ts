import {
  type BlowSpec,
  createOverlay,
  createSmokeOverlay,
  type Overlay,
  type OverlayFault,
  type OverlayFaultSpec,
  type OverlayOptions,
  type OverlaySmokeFault,
  type Point,
  type SmokeOverlay,
} from '../src/index.js';

export type EngineName = 'old' | 'smoke';

/** `?engine=smoke` runs a lab on the blits engine; anything else on the old one. */
export const engineName: EngineName =
  new URLSearchParams(location.search).get('engine') === 'smoke' ? 'smoke' : 'old';

class SmokeFault implements OverlayFault {
  private readonly inner: OverlaySmokeFault;

  constructor(inner: OverlaySmokeFault) {
    this.inner = inner;
  }

  get intensity(): number {
    return this.inner.weight;
  }

  set intensity(value: number) {
    this.inner.weight = value;
  }

  get at(): Point {
    return this.inner.at;
  }

  set at(value: Point) {
    this.inner.at = value;
  }

  get to(): Point | null {
    return this.inner.to;
  }

  set to(value: Point | null) {
    this.inner.to = value;
  }

  blow(spec?: BlowSpec): void {
    this.inner.blow(spec);
  }

  stop(): void {
    this.inner.fade();
  }
}

/** A blits-engine overlay behind the old interface, so a lab drives either the same way. */
class SmokeAsOverlay implements Overlay {
  private readonly smoke: SmokeOverlay;

  constructor(smoke: SmokeOverlay) {
    this.smoke = smoke;
  }

  get supported() {
    return this.smoke.supported;
  }

  get live() {
    return this.smoke.live;
  }

  get tuning() {
    return this.smoke.tuning;
  }

  get volume() {
    return this.smoke.volume;
  }

  set volume(v: number) {
    this.smoke.volume = v;
  }

  get muted() {
    return this.smoke.muted;
  }

  set muted(v: boolean) {
    this.smoke.muted = v;
  }

  get whine() {
    return this.smoke.whine;
  }

  set whine(v: number) {
    this.smoke.whine = v;
  }

  sputter(at: Point, energy?: number) {
    this.smoke.sputter(at, energy);
  }

  burst(at: Point, energy?: number) {
    this.smoke.burst(at, energy);
  }

  shower(at: Point, energy?: number) {
    this.smoke.shower(at, energy);
  }

  arc(from: Point, to: Point, energy?: number) {
    this.smoke.arc(from, to, energy);
  }

  fault(spec: OverlayFaultSpec): OverlayFault {
    return new SmokeFault(
      this.smoke.cue({ at: spec.at, to: spec.to ?? null }, { weight: spec.intensity ?? 0 }),
    );
  }

  render(): void {
    throw new Error('the blits engine is driven by its own loop or sync(timestamp)');
  }

  dispose() {
    this.smoke.dispose();
  }
}

export function overlayFor(options: OverlayOptions = {}, engine = engineName): Overlay {
  return engine === 'smoke'
    ? new SmokeAsOverlay(createSmokeOverlay(options))
    : createOverlay(options);
}
