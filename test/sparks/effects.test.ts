import { Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../src/rng.js';
import { Arcs } from '../../src/sparks/arcs.js';
import { SparkEmitters } from '../../src/sparks/emitters.js';
import { Flashes, SPARK_TINT } from '../../src/sparks/flashes.js';

const origin = { x: 0, y: 0, z: 0 };

function advance(update: (dt: number) => void, seconds: number) {
  for (let t = 0; t < seconds; t += 1 / 60) update(1 / 60);
}

describe('SparkEmitters', () => {
  it('is live after a burst and settles once the sparks die', () => {
    const emitters = new SparkEmitters({ scale: 1, floor: null });
    new Scene().add(emitters.object);
    expect(emitters.live).toBe(false);
    emitters.fire('burst', origin, 1);
    emitters.update(1 / 60);
    expect(emitters.particles).toBe(40);
    advance((dt) => emitters.update(dt), 2);
    expect(emitters.live).toBe(false);
  });

  it('spawns exactly the count asked for', () => {
    const emitters = new SparkEmitters({ scale: 1, floor: null });
    new Scene().add(emitters.object);
    emitters.spawn('fizz', origin, 3);
    emitters.update(1 / 60);
    expect(emitters.particles).toBe(3);
  });

  it('survives updates before it is added to a scene', () => {
    const emitters = new SparkEmitters({ scale: 1, floor: 0 });
    emitters.update(0.1);
    new Scene().add(emitters.object);
    emitters.fire('shower', origin, 1);
    emitters.update(1 / 60);
    expect(emitters.live).toBe(true);
  });

  it('scales the count with energy', () => {
    const emitters = new SparkEmitters({ scale: 1, floor: null });
    new Scene().add(emitters.object);
    emitters.fire('shower', origin, 0);
    emitters.update(1 / 60);
    expect(emitters.particles).toBe(40);
  });
});

describe('Flashes', () => {
  it('lights up for about a tenth of a second', () => {
    const flashes = new Flashes({ scale: 1, lights: true });
    flashes.fire(origin, 1, SPARK_TINT);
    expect(flashes.live).toBe(true);
    advance((dt) => flashes.update(dt), 0.2);
    expect(flashes.live).toBe(false);
  });

  it('keeps its lights in the scene when idle', () => {
    const flashes = new Flashes({ scale: 1, lights: true });
    const lights = flashes.object.children.filter((c) => (c as { isLight?: boolean }).isLight);
    expect(lights).toHaveLength(4);
  });
});

describe('Arcs', () => {
  it('is live for the strike’s duration', () => {
    const arcs = new Arcs(mulberry32(1), 1);
    arcs.strike(origin, { x: 100, y: 0, z: 0 }, 1, 0.1);
    expect(arcs.live).toBe(true);
    advance((dt) => arcs.update(dt), 0.15);
    expect(arcs.live).toBe(false);
  });

  it('keeps at most four strikes', () => {
    const arcs = new Arcs(mulberry32(1), 1);
    for (let i = 0; i < 6; i++) arcs.strike(origin, { x: 100, y: 0, z: 0 }, 1, 1 + i);
    advance((dt) => arcs.update(dt), 2.05);
    expect(arcs.live).toBe(true);
    advance((dt) => arcs.update(dt), 4);
    expect(arcs.live).toBe(false);
  });
});
