import {
  AdditiveBlending,
  Group,
  PointLight,
  Sprite,
  SpriteMaterial,
  type Texture,
  Vector3,
} from 'three';
import type { Vec3 } from '../types.js';
import { glowTexture } from './textures.js';

const GLOWS = 12;
const LIGHTS = 4;
const LIFE = 0.12;
/** Opacity of a glow at energy 1. Squared energy leaves small flares nearly dark. */
const GLOW_PEAK = 0.6;
/** A flash this close to a lit glow, as a share of its size, relights that glow instead. */
const MERGE = 0.5;
/** Point light intensity at energy 1 and scale 1; a light 100 units away needs this order to show. */
const LIGHT_PEAK = 20000;

const spot = new Vector3();

export const SPARK_TINT = 0xffbe6e;
export const ARC_TINT = 0x8caaff;

interface Glow {
  sprite: Sprite;
  material: SpriteMaterial;
  age: number;
  peak: number;
  size: number;
}

interface Lamp {
  light: PointLight;
  age: number;
  peak: number;
}

export interface FlashOptions {
  scale: number;
  lights: boolean;
}

/** Glow sprites at each discharge, and a fixed pool of point lights for anything lit nearby. */
export class Flashes {
  readonly object = new Group();
  private readonly texture: Texture;
  private readonly glows: Glow[] = [];
  private readonly lamps: Lamp[] = [];
  private readonly scale: number;
  private nextGlow = 0;
  private nextLamp = 0;

  constructor(options: FlashOptions) {
    this.scale = options.scale;
    this.texture = glowTexture();
    for (let i = 0; i < GLOWS; i++) {
      const material = new SpriteMaterial({
        map: this.texture,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        opacity: 0,
      });
      const sprite = new Sprite(material);
      sprite.visible = false;
      this.object.add(sprite);
      this.glows.push({ sprite, material, age: LIFE, peak: 0, size: 0 });
    }
    // The lights stay in the scene at zero intensity: changing how many lights a scene holds
    // recompiles every lit material in it.
    if (options.lights) {
      for (let i = 0; i < LIGHTS; i++) {
        const light = new PointLight(SPARK_TINT, 0, 300 * this.scale, 2);
        this.object.add(light);
        this.lamps.push({ light, age: LIFE, peak: 0 });
      }
    }
  }

  get live(): boolean {
    return this.glows.some((g) => g.age < LIFE) || this.lamps.some((l) => l.age < LIFE);
  }

  fire(at: Vec3, energy: number, tint: number): void {
    const peak = GLOW_PEAK * energy * energy;
    const size = (24 + 40 * energy) * this.scale;
    // Additive glows landing on one spot within their life sum past white into a flat disc, so a
    // flash near a lit glow relights it at the brighter of the two rather than stacking.
    spot.set(at.x, at.y, at.z);
    const near = this.glows.find(
      (g) => g.age < LIFE && g.sprite.position.distanceTo(spot) < MERGE * Math.max(g.size, size),
    );
    if (near) {
      near.peak = Math.max(near.peak * (1 - near.age / LIFE), peak);
      near.size = Math.max(near.size, size);
      near.age = 0;
      near.material.color.set(tint);
    } else {
      const glow = this.glows[this.nextGlow] as Glow;
      this.nextGlow = (this.nextGlow + 1) % GLOWS;
      glow.age = 0;
      glow.peak = peak;
      glow.size = size;
      glow.material.color.set(tint);
      glow.sprite.position.set(at.x, at.y, at.z);
    }

    const lamp = this.lamps[this.nextLamp];
    if (lamp) {
      this.nextLamp = (this.nextLamp + 1) % this.lamps.length;
      lamp.age = 0;
      lamp.peak = LIGHT_PEAK * energy * this.scale * this.scale;
      lamp.light.color.set(tint);
      lamp.light.position.set(at.x, at.y, at.z);
    }
    this.apply();
  }

  update(dt: number): void {
    for (const glow of this.glows) glow.age = Math.min(LIFE, glow.age + dt);
    for (const lamp of this.lamps) lamp.age = Math.min(LIFE, lamp.age + dt);
    this.apply();
  }

  dispose(): void {
    for (const glow of this.glows) glow.material.dispose();
    for (const lamp of this.lamps) lamp.light.dispose();
    this.texture.dispose();
    this.object.removeFromParent();
    this.object.clear();
  }

  private apply(): void {
    for (const glow of this.glows) {
      const k = 1 - glow.age / LIFE;
      glow.sprite.visible = k > 0;
      glow.material.opacity = glow.peak * k;
      const size = glow.size * (1.4 - 0.4 * k);
      glow.sprite.scale.set(size, size, 1);
    }
    for (const lamp of this.lamps) {
      lamp.light.intensity = lamp.peak * (1 - lamp.age / LIFE);
    }
  }
}
