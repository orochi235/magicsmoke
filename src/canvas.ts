import { type Object3D, OrthographicCamera, Scene, type WebGLRenderer } from 'three';
import type { Point, Vec3 } from './types.js';

const CLASS = 'magicsmoke-overlay';
const CSS = `.${CLASS}{position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483000}`;

export interface Drawn {
  readonly object: Object3D;
  setFloor(y: number | null): void;
  dispose(): void;
}

/** A transparent canvas over the viewport and the frame loop that draws it. */
export abstract class Canvas {
  readonly supported = true;
  protected readonly renderer: WebGLRenderer;
  protected readonly scene = new Scene();
  protected readonly camera = new OrthographicCamera(0, 1, 0, -1, -1000, 1000);
  protected disposed = false;
  private readonly style: HTMLStyleElement;
  private readonly loop: boolean;
  private readonly floor: number | null | undefined;
  private frame = 0;
  private drawn: Drawn | null = null;

  constructor(renderer: WebGLRenderer, options: { loop?: boolean; floor?: number | null }) {
    this.renderer = renderer;
    this.loop = options.loop ?? true;
    this.floor = options.floor;
    this.style = document.createElement('style');
    this.style.textContent = CSS;
    document.head.appendChild(this.style);
    renderer.domElement.classList.add(CLASS);
    renderer.setClearColor(0x000000, 0);
    document.body.appendChild(renderer.domElement);
  }

  /** Puts the engine on the canvas; call once from the subclass constructor. */
  protected mount(drawn: Drawn): void {
    this.drawn = drawn;
    this.scene.add(drawn.object);
    this.resize();
    window.addEventListener('resize', this.resize);
  }

  /** Advances to `now`, the rAF timestamp, and draws. */
  protected abstract frameAt(now: number): void;

  /** Whether the loop should run another frame. */
  protected abstract get awake(): boolean;

  /** The loop slept; the next frame is the first after a pause. */
  protected slept(): void {}

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.frame) cancelAnimationFrame(this.frame);
    window.removeEventListener('resize', this.resize);
    this.drawn?.dispose();
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
    this.drawn?.setFloor(floor === null ? null : -floor);
  };

  protected readonly wake = () => {
    if (!this.loop || this.frame || this.disposed) return;
    this.frame = requestAnimationFrame(this.tick);
  };

  private readonly tick = (now: number) => {
    this.frame = 0;
    this.frameAt(now);
    if (this.awake) this.wake();
    else this.slept();
  };
}

export const toWorld = (p: Point): Vec3 => ({ x: p.x, y: -p.y, z: 0 });
export const toClient = (v: Vec3): Point => ({ x: v.x, y: -v.y });

/** Stereo position across the viewport, kept off the extremes. */
export const viewportPan = (at: Vec3) =>
  Math.max(-1, Math.min(1, (at.x / window.innerWidth) * 2 - 1)) * 0.8;
