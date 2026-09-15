import { OrthographicCamera, Scene, WebGLRenderer } from 'three';
import { createLayer, type Fault, type Layer, type LayerOptions } from './layer.js';
import { resolveTuning, type Tuning } from './tuning.js';
import type { Point, Vec3 } from './types.js';

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
  sputter(at: Point, energy?: number): void;
  burst(at: Point, energy?: number): void;
  shower(at: Point, energy?: number): void;
  arc(from: Point, to: Point, energy?: number): void;
  fault(spec: OverlayFaultSpec): OverlayFault;
  /** Advances by `dt` seconds and draws one frame. */
  render(dt: number): void;
  dispose(): void;
}

const CLASS = 'magicsmoke-overlay';
const CSS = `.${CLASS}{position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483000}`;

const toWorld = (p: Point): Vec3 => ({ x: p.x, y: -p.y, z: 0 });
const toClient = (v: Vec3): Point => ({ x: v.x, y: -v.y });

class OverlayFaultHandle implements OverlayFault {
  private readonly inner: Fault;
  private readonly wake: () => void;

  constructor(inner: Fault, wake: () => void) {
    this.inner = inner;
    this.wake = wake;
  }

  get intensity(): number {
    return this.inner.intensity;
  }

  set intensity(value: number) {
    this.inner.intensity = value;
    this.wake();
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

  stop(): void {
    this.inner.stop();
    this.wake();
  }
}

class InertFault implements OverlayFault {
  intensity = 0;
  at: Point;
  to: Point | null;

  constructor(spec: OverlayFaultSpec) {
    this.at = spec.at;
    this.to = spec.to ?? null;
  }

  stop(): void {}
}

class Unsupported implements Overlay {
  readonly supported = false;
  readonly live = false;
  readonly tuning: Tuning = resolveTuning();
  volume = 0.8;
  muted = false;
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

class WebGLOverlay implements Overlay {
  readonly supported = true;
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(0, 1, 0, -1, -1000, 1000);
  private readonly layer: Layer;
  private readonly style: HTMLStyleElement;
  private readonly loop: boolean;
  private readonly floor: number | null | undefined;
  private frame = 0;
  private last: number | null = null;
  private disposed = false;

  constructor(renderer: WebGLRenderer, options: OverlayOptions) {
    this.renderer = renderer;
    this.loop = options.loop ?? true;
    this.floor = options.floor;
    this.style = document.createElement('style');
    this.style.textContent = CSS;
    document.head.appendChild(this.style);
    renderer.domElement.classList.add(CLASS);
    renderer.setClearColor(0x000000, 0);
    document.body.appendChild(renderer.domElement);

    this.layer = createLayer({
      ...options,
      scale: 1,
      floor: null,
      pan: (at) => Math.max(-1, Math.min(1, (at.x / window.innerWidth) * 2 - 1)) * 0.8,
    });
    this.scene.add(this.layer.object);
    this.resize();
    window.addEventListener('resize', this.resize);
  }

  get live(): boolean {
    return this.layer.live;
  }

  get tuning(): Tuning {
    return this.layer.tuning;
  }

  get volume(): number {
    return this.layer.volume;
  }

  set volume(value: number) {
    this.layer.volume = value;
  }

  get muted(): boolean {
    return this.layer.muted;
  }

  set muted(value: boolean) {
    this.layer.muted = value;
  }

  sputter(at: Point, energy?: number): void {
    this.layer.sputter(toWorld(at), energy);
    this.wake();
  }

  burst(at: Point, energy?: number): void {
    this.layer.burst(toWorld(at), energy);
    this.wake();
  }

  shower(at: Point, energy?: number): void {
    this.layer.shower(toWorld(at), energy);
    this.wake();
  }

  arc(from: Point, to: Point, energy?: number): void {
    this.layer.arc(toWorld(from), toWorld(to), energy);
    this.wake();
  }

  fault(spec: OverlayFaultSpec): OverlayFault {
    const inner = this.layer.fault({
      at: toWorld(spec.at),
      ...(spec.to ? { to: toWorld(spec.to) } : {}),
      ...(spec.intensity === undefined ? {} : { intensity: spec.intensity }),
    });
    this.wake();
    return new OverlayFaultHandle(inner, this.wake);
  }

  render(dt: number): void {
    if (this.disposed) return;
    this.layer.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.frame) cancelAnimationFrame(this.frame);
    window.removeEventListener('resize', this.resize);
    this.layer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.style.remove();
  }

  private readonly resize = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height, false);
    this.camera.right = width;
    this.camera.bottom = -height;
    this.camera.updateProjectionMatrix();
    const floor = this.floor === undefined ? height : this.floor;
    this.layer.setFloor(floor === null ? null : -floor);
  };

  private readonly wake = () => {
    if (!this.loop || this.frame || this.disposed) return;
    this.frame = requestAnimationFrame(this.tick);
  };

  private readonly tick = (now: number) => {
    this.frame = 0;
    const dt = this.last === null ? 1 / 60 : (now - this.last) / 1000;
    this.last = now;
    this.render(dt);
    if (this.layer.live) this.wake();
    else this.last = null;
  };
}

/** A transparent canvas over the viewport, drawing a layer in client coordinates. */
export function createOverlay(options: OverlayOptions = {}): Overlay {
  if (typeof document === 'undefined') return new Unsupported();
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ alpha: true, antialias: true });
  } catch {
    return new Unsupported();
  }
  return new WebGLOverlay(renderer, options);
}
