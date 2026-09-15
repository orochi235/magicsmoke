import {
  AdditiveBlending,
  Group,
  Matrix4,
  MeshBasicMaterial,
  type Object3D,
  type Texture,
} from 'three';
import {
  ApplyCollision,
  ApplyForce,
  BatchedRenderer,
  Bezier,
  ColorOverLife,
  ConstantColor,
  ConstantValue,
  type EmissionState,
  Gradient,
  IntervalValue,
  ParticleSystem,
  PiecewiseBezier,
  Vector3 as QVector3,
  RenderMode,
  SizeOverLife,
  SpeedOverLife,
  SphereEmitter,
  Vector4,
} from 'three.quarks';
import type { Vec3 } from '../types.js';
import { SPARKS, type SparkKind, type SparkSpec } from './kinds.js';
import { dotTexture } from './textures.js';

export interface EmitterOptions {
  scale: number;
  /** World y that bouncing sparks land on, or `null` for none. */
  floor: number | null;
}

type EmitMatrix = Parameters<ParticleSystem['emit']>[2];

const KINDS = Object.keys(SPARKS) as SparkKind[];
const BOUNCE = 0.35;
/** Streak length is `(speed · speedFactor + 1) · size`; this reads well at one unit per pixel. */
const SPEED_FACTOR = 0.012;

function rescale(generator: unknown, [low, high]: readonly [number, number], k: number): void {
  const interval = generator as IntervalValue;
  interval.a = low * k;
  interval.b = high * k;
}

function inScene(object: Object3D): boolean {
  let node: Object3D | null = object;
  while (node) {
    if ((node as { isScene?: boolean }).isScene) return true;
    node = node.parent;
  }
  return false;
}

function cooling(): Gradient {
  return new Gradient(
    [
      [new QVector3(1, 1, 0.9), 0],
      [new QVector3(1, 0.85, 0.4), 0.3],
      [new QVector3(1, 0.45, 0.1), 0.7],
      [new QVector3(0.8, 0.15, 0.05), 1],
    ],
    [
      [1, 0],
      [1, 0.6],
      [0, 1],
    ],
  );
}

function ramp(from: number, to: number): PiecewiseBezier {
  const step = (to - from) / 3;
  return new PiecewiseBezier([[new Bezier(from, from + step, from + 2 * step, to), 0]]);
}

function freshState(count: number): EmissionState {
  return {
    burstIndex: 0,
    burstWaveIndex: 0,
    burstParticleIndex: 0,
    burstParticleCount: 0,
    isBursting: false,
    time: 0,
    waitEmiting: count,
    travelDistance: 0,
  };
}

/** One three.quarks system per kind of spark, created once so no shader compiles mid-effect. */
export class SparkEmitters {
  readonly object = new Group();
  private readonly batch = new BatchedRenderer();
  private readonly systems = new Map<SparkKind, ParticleSystem>();
  private readonly texture: Texture;
  private readonly material: MeshBasicMaterial;
  private readonly matrix = new Matrix4();
  private readonly floor: { y: number | null };
  private readonly scale: number;
  private applied = { size: 1, speed: 1, life: 1 };

  constructor(options: EmitterOptions) {
    this.floor = { y: options.floor };
    this.scale = options.scale;
    this.texture = dotTexture();
    this.material = new MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.object.add(this.batch);
    for (const kind of KINDS) {
      const system = this.build(SPARKS[kind], options.scale);
      this.systems.set(kind, system);
      this.batch.addSystem(system);
      this.object.add(system.emitter);
    }
  }

  get particles(): number {
    let n = 0;
    for (const system of this.systems.values()) n += system.particleNum;
    return n;
  }

  get live(): boolean {
    return this.particles > 0;
  }

  /** Rescales every kind's size, speed and life for sparks spawned from now on. */
  retune({ size, speed, life }: { size: number; speed: number; life: number }): void {
    const was = this.applied;
    if (was.size === size && was.speed === speed && was.life === life) return;
    this.applied = { size, speed, life };
    for (const [kind, system] of this.systems) {
      const spec = SPARKS[kind];
      rescale(system.startSize, spec.size, this.scale * size);
      rescale(system.startSpeed, spec.speed, this.scale * speed);
      rescale(system.startLife, spec.life, life);
    }
  }

  setFloor(y: number | null): void {
    this.floor.y = y;
  }

  /** Fires the kind's particle count for `energy`, times `countScale`. */
  fire(kind: SparkKind, at: Vec3, energy: number, countScale = 1): void {
    const [low, high] = SPARKS[kind].count;
    this.spawn(kind, at, Math.round((low + (high - low) * energy) * countScale));
  }

  spawn(kind: SparkKind, at: Vec3, count: number): void {
    const system = this.systems.get(kind);
    if (!system || count <= 0) return;
    this.matrix.makeTranslation(at.x, at.y, at.z);
    // quarks types `emit` against its own Matrix4, but its own update passes three's `matrixWorld`.
    system.emit(0, freshState(count), this.matrix as unknown as EmitMatrix);
  }

  update(dt: number): void {
    // A quarks system whose emitter has no Scene ancestor disposes itself on update.
    if (inScene(this.object)) this.batch.update(dt);
  }

  dispose(): void {
    for (const system of this.systems.values()) {
      this.batch.deleteSystem(system);
      system.dispose();
    }
    this.systems.clear();
    this.material.dispose();
    this.texture.dispose();
    this.object.removeFromParent();
    this.object.clear();
  }

  private build(spec: SparkSpec, scale: number): ParticleSystem {
    const behaviors: ParticleSystem['behaviors'] = [
      new ColorOverLife(cooling()),
      new SizeOverLife(ramp(1, 0.2)),
      new SpeedOverLife(ramp(1, spec.dragTo)),
      new ApplyForce(new QVector3(0, -1, 0), new ConstantValue(spec.gravity * scale)),
    ];
    if (spec.bounces) {
      const floor = this.floor;
      behaviors.push(
        new ApplyCollision(
          {
            resolve(position, normal) {
              if (floor.y === null || position.y >= floor.y) return false;
              position.y = floor.y;
              normal.set(0, 1, 0);
              return true;
            },
          },
          BOUNCE,
        ),
      );
    }
    return new ParticleSystem({
      looping: true,
      duration: 1,
      onlyUsedByOther: true,
      worldSpace: true,
      shape: new SphereEmitter({ radius: 0.01 * scale, thickness: 1, arc: Math.PI * 2 }),
      startLife: new IntervalValue(spec.life[0], spec.life[1]),
      startSpeed: new IntervalValue(spec.speed[0] * scale, spec.speed[1] * scale),
      startSize: new IntervalValue(spec.size[0] * scale, spec.size[1] * scale),
      startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
      emissionOverTime: new ConstantValue(0),
      renderMode: RenderMode.StretchedBillBoard,
      rendererEmitterSettings: { speedFactor: SPEED_FACTOR / scale, lengthFactor: 1 },
      material: this.material,
      behaviors,
    });
  }
}
