import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  type Camera,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  Mesh,
  MeshBasicMaterial,
  Vector3,
} from 'three';
import type { Rng } from '../rng.js';
import type { Vec3 } from '../types.js';

const MAX_ARCS = 4;
const MAIN_DEPTH = 6;
const BRANCH_DEPTH = 4;
const SEGMENTS_PER_ARC = 2 ** MAIN_DEPTH + 2 ** BRANCH_DEPTH;
const MAX_VERTICES = MAX_ARCS * SEGMENTS_PER_ARC * 6;

/** Wide faint blue, mid, white core: stacked additive ribbons standing in for bloom. */
const PASSES = [
  { width: 7, color: 0x6e96ff, opacity: 0.22 },
  { width: 2.5, color: 0xaac8ff, opacity: 0.7 },
  { width: 1, color: 0xffffff, opacity: 1 },
] as const;

interface Strike {
  from: Vector3;
  to: Vector3;
  energy: number;
  remaining: number;
}

interface Path {
  points: Vector3[];
  width: number;
}

const tangent = new Vector3();
const side = new Vector3();
const view = new Vector3();

function viewDirection(camera: Camera, at: Vector3, out: Vector3): Vector3 {
  if ((camera as { isOrthographicCamera?: boolean }).isOrthographicCamera) {
    return camera.getWorldDirection(out);
  }
  return out.setFromMatrixPosition(camera.matrixWorld).sub(at).normalize();
}

/** Midpoint displacement, offsetting each midpoint across the line of sight so every jag shows. */
function bolt(from: Vector3, to: Vector3, rough: number, depth: number, look: Vector3, rng: Rng) {
  let points = [from.clone(), to.clone()];
  for (let d = 0; d < depth; d++) {
    const next: Vector3[] = [points[0] as Vector3];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1] as Vector3;
      const b = points[i] as Vector3;
      const length = a.distanceTo(b);
      side.subVectors(b, a).cross(look).normalize();
      const offset = (rng() * 2 - 1) * length * rough;
      next.push(a.clone().lerp(b, 0.5).addScaledVector(side, offset), b);
    }
    points = next;
  }
  return points;
}

/** Electrical arcs as camera-facing ribbons, re-jagged every rendered frame of a strike. */
export class Arcs {
  readonly object = new Group();
  private readonly strikes: Strike[] = [];
  private readonly meshes: Mesh<BufferGeometry, MeshBasicMaterial>[];
  private readonly rng: Rng;
  private readonly scale: number;
  private paths: Path[] = [];
  private lastFrame = -1;

  constructor(rng: Rng, scale: number) {
    this.rng = rng;
    this.scale = scale;
    this.meshes = PASSES.map((pass, i) => {
      const geometry = new BufferGeometry();
      const positions = new BufferAttribute(new Float32Array(MAX_VERTICES * 3), 3);
      positions.setUsage(DynamicDrawUsage);
      geometry.setAttribute('position', positions);
      const material = new MeshBasicMaterial({
        color: pass.color,
        opacity: pass.opacity,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        blending: AdditiveBlending,
      });
      const mesh = new Mesh(geometry, material);
      mesh.frustumCulled = false;
      mesh.visible = false;
      mesh.renderOrder = 10 + i;
      mesh.onBeforeRender = (renderer, _scene, camera) => {
        if (renderer.info.render.frame !== this.lastFrame) {
          this.lastFrame = renderer.info.render.frame;
          this.regenerate(camera);
        }
        this.write(mesh, pass.width, camera);
      };
      this.object.add(mesh);
      return mesh;
    });
  }

  get live(): boolean {
    return this.strikes.length > 0;
  }

  strike(from: Vec3, to: Vec3, energy: number, duration: number): void {
    if (this.strikes.length >= MAX_ARCS) this.strikes.shift();
    this.strikes.push({
      from: new Vector3(from.x, from.y, from.z),
      to: new Vector3(to.x, to.y, to.z),
      energy,
      remaining: duration,
    });
    this.setVisible(true);
  }

  update(dt: number): void {
    for (let i = this.strikes.length - 1; i >= 0; i--) {
      const strike = this.strikes[i] as Strike;
      strike.remaining -= dt;
      if (strike.remaining <= 0) this.strikes.splice(i, 1);
    }
    if (this.strikes.length === 0) this.setVisible(false);
  }

  dispose(): void {
    for (const mesh of this.meshes) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.object.removeFromParent();
    this.object.clear();
  }

  private setVisible(visible: boolean): void {
    for (const mesh of this.meshes) mesh.visible = visible;
  }

  private regenerate(camera: Camera): void {
    const rng = this.rng;
    this.paths = [];
    for (const strike of this.strikes) {
      const mid = strike.from.clone().lerp(strike.to, 0.5);
      const look = viewDirection(camera, mid, view).clone();
      const width = 0.6 + 0.4 * strike.energy;
      const main = bolt(strike.from, strike.to, 0.28, MAIN_DEPTH, look, rng);
      this.paths.push({ points: main, width });
      if (rng() < 0.5) {
        const start = main[Math.floor(rng() * main.length)] as Vector3;
        const reach = strike.from.distanceTo(strike.to) * (0.15 + 0.2 * rng());
        tangent.subVectors(strike.to, strike.from).normalize();
        side.copy(tangent).cross(look).normalize();
        const end = start
          .clone()
          .addScaledVector(tangent, (rng() * 2 - 1) * reach)
          .addScaledVector(side, (rng() * 2 - 1) * reach);
        this.paths.push({
          points: bolt(start, end, 0.35, BRANCH_DEPTH, look, rng),
          width: width * 0.5,
        });
      }
    }
  }

  private write(mesh: Mesh<BufferGeometry, MeshBasicMaterial>, width: number, camera: Camera) {
    const attribute = mesh.geometry.getAttribute('position') as BufferAttribute;
    const out = attribute.array as Float32Array;
    let v = 0;
    const halfSides: Vector3[] = [];
    for (const path of this.paths) {
      const { points } = path;
      const half = (width * path.width * this.scale) / 2;
      halfSides.length = 0;
      for (let i = 0; i < points.length; i++) {
        const p = points[i] as Vector3;
        const prev = points[Math.max(0, i - 1)] as Vector3;
        const next = points[Math.min(points.length - 1, i + 1)] as Vector3;
        tangent.subVectors(next, prev);
        viewDirection(camera, p, view);
        halfSides.push(tangent.cross(view).normalize().multiplyScalar(half).clone());
      }
      for (let i = 0; i + 1 < points.length && v + 6 <= MAX_VERTICES; i++) {
        const a = points[i] as Vector3;
        const b = points[i + 1] as Vector3;
        const sa = halfSides[i] as Vector3;
        const sb = halfSides[i + 1] as Vector3;
        const quad = [
          [a, sa, -1],
          [a, sa, 1],
          [b, sb, -1],
          [b, sb, -1],
          [a, sa, 1],
          [b, sb, 1],
        ] as const;
        for (const [p, s, sign] of quad) {
          out[v * 3] = p.x + s.x * sign;
          out[v * 3 + 1] = p.y + s.y * sign;
          out[v * 3 + 2] = p.z + s.z * sign;
          v++;
        }
      }
    }
    attribute.needsUpdate = true;
    mesh.geometry.setDrawRange(0, Math.max(v, 3));
  }
}
