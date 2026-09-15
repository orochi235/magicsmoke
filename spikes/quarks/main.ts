// Answers three questions before any module is written:
// 1. Can a burst of N particles be fired at an arbitrary point on demand, through public API?
// 2. Does ApplyCollision keep stretched billboards above a floor?
// 3. Does additive blending onto a transparent premultiplied canvas stay valid (rgb <= alpha)?
// `?blend=stock` uses three's AdditiveBlending; `?blend=premul` uses custom factors that keep
// alpha accumulating alongside color.
import * as THREE from 'three';
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
  SphereEmitter,
  Vector4,
} from 'three.quarks';

const params = new URLSearchParams(location.search);
const blend = params.get('blend') ?? 'stock';

const renderer = new THREE.WebGLRenderer({
  alpha: true,
  antialias: true,
  premultipliedAlpha: true,
  preserveDrawingBuffer: true,
});
renderer.setClearColor(0x000000, 0);
renderer.setPixelRatio(1);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(0, 1, 0, -1, -1000, 1000);
let floorY = 0;

function resize() {
  const w = innerWidth;
  const h = innerHeight;
  renderer.setSize(w, h);
  camera.right = w;
  camera.bottom = -h;
  camera.updateProjectionMatrix();
  floorY = -(h - 40);
}
resize();
addEventListener('resize', resize);

function dotTexture(): THREE.Texture {
  const size = 32;
  const c = (size - 1) / 2;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.min(1, Math.hypot(x - c, y - c) / c);
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.round((1 - d) ** 2 * 255);
    }
  }
  const tex = new THREE.DataTexture(data, size, size);
  tex.needsUpdate = true;
  return tex;
}

const material = new THREE.MeshBasicMaterial({
  map: dotTexture(),
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
if (blend === 'premul') {
  material.blending = THREE.CustomBlending;
  material.blendEquation = THREE.AddEquation;
  material.blendSrc = THREE.SrcAlphaFactor;
  material.blendDst = THREE.OneFactor;
  material.blendSrcAlpha = THREE.OneFactor;
  material.blendDstAlpha = THREE.OneFactor;
}

const system = new ParticleSystem({
  looping: true,
  duration: 1,
  onlyUsedByOther: true,
  worldSpace: true,
  shape: new SphereEmitter({ radius: 0.01, thickness: 1, arc: Math.PI * 2 }),
  startLife: new IntervalValue(0.4, 1.3),
  startSpeed: new IntervalValue(120, 520),
  // A streak is `size` wide and `(speed·speedFactor + lengthFactor)·size` long.
  startSize: new IntervalValue(4, 7),
  startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
  emissionOverTime: new ConstantValue(0),
  renderMode: RenderMode.StretchedBillBoard,
  rendererEmitterSettings: { speedFactor: 0.012, lengthFactor: 1 },
  material,
  behaviors: [
    new ColorOverLife(
      new Gradient(
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
      ),
    ),
    new SizeOverLife(new PiecewiseBezier([[new Bezier(1, 0.9, 0.6, 0.2), 0]])),
    new ApplyForce(new QVector3(0, -1, 0), new ConstantValue(900)),
    new ApplyCollision(
      {
        resolve(pos, normal) {
          if (pos.y >= floorY) return false;
          pos.y = floorY;
          normal.set(0, 1, 0);
          return true;
        },
      },
      0.35,
    ),
  ],
});

const batch = new BatchedRenderer();
scene.add(batch);
batch.addSystem(system);
scene.add(system.emitter);

const at = new THREE.Matrix4();
function burst(x: number, y: number, count: number) {
  const state: EmissionState = {
    burstIndex: 0,
    burstWaveIndex: 0,
    burstParticleIndex: 0,
    burstParticleCount: 0,
    isBursting: false,
    time: 0,
    waitEmiting: count,
    travelDistance: 0,
  };
  at.makeTranslation(x, -y, 0);
  // quarks types `emit` against its own Matrix4, but its own update passes three's `matrixWorld`.
  system.emit(0, state, at as unknown as Parameters<typeof system.emit>[2]);
}

addEventListener('pointerdown', (e) => burst(e.clientX, e.clientY, 60));

function stats() {
  const gl = renderer.getContext();
  const w = gl.drawingBufferWidth;
  const h = gl.drawingBufferHeight;
  const px = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  let lit = 0;
  let overAlpha = 0;
  let maxOver = 0;
  for (let i = 0; i < px.length; i += 4) {
    const m = Math.max(px[i] ?? 0, px[i + 1] ?? 0, px[i + 2] ?? 0);
    const a = px[i + 3] ?? 0;
    if (m > 0 || a > 0) lit++;
    if (m > a) {
      overAlpha++;
      maxOver = Math.max(maxOver, m - a);
    }
  }
  const alive = system.particles.slice(0, system.particleNum);
  const xs = alive.map((p) => p.position.x);
  const ys = alive.map((p) => -p.position.y);
  const belowFloor = alive.filter((p) => p.position.y < floorY - 1).length;
  return {
    blend,
    lit,
    overAlpha,
    maxOver,
    particles: system.particleNum,
    belowFloor,
    xRange: [Math.min(...xs), Math.max(...xs)],
    yRange: [Math.min(...ys), Math.max(...ys)],
  };
}

let paused = false;
let last = performance.now();
let nextBurst = 0;
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!paused) {
    nextBurst -= dt;
    if (nextBurst <= 0) {
      burst(innerWidth * (0.25 + Math.random() * 0.5), innerHeight * 0.3, 60);
      nextBurst = 0.7;
    }
    batch.update(dt);
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

Object.assign(window, {
  spike: {
    stats,
    burst,
    pause: () => {
      paused = true;
    },
    /** Steps the simulation by hand: fires one burst at (x, y), then advances `frames` 60fps frames. */
    run(x: number, y: number, frames: number) {
      paused = true;
      burst(x, y, 60);
      for (let i = 0; i < frames; i++) batch.update(1 / 60);
      renderer.render(scene, camera);
      return stats();
    },
  },
});
