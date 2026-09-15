import { Scene } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createLayer, type LayerOptions } from '../src/layer.js';
import type { Discharge } from '../src/types.js';

const origin = { x: 0, y: 0, z: 0 };

function setup(options: LayerOptions = {}) {
  const seen: Discharge[] = [];
  const layer = createLayer({ seed: 1, ...options, onDischarge: (d) => seen.push(d) });
  new Scene().add(layer.object);
  const advance = (seconds: number) => {
    for (let t = 0; t < seconds; t += 1 / 60) layer.update(1 / 60);
  };
  return { layer, seen, advance };
}

describe('createLayer', () => {
  it('discharges at the fault while it runs', () => {
    const { layer, seen, advance } = setup();
    layer.fault({ at: { x: 1, y: 2, z: 0 }, intensity: 1 });
    advance(3);
    expect(seen.length).toBeGreaterThan(5);
    expect(seen.every((d) => d.at.x === 1 && d.at.y === 2)).toBe(true);
  });

  it('arcs only when the fault has somewhere to land', () => {
    const grounded = setup();
    grounded.layer.fault({ at: origin, to: { x: 100, y: 0, z: 0 }, intensity: 1 });
    grounded.advance(30);
    const arcs = grounded.seen.filter((d) => d.kind === 'arc');
    expect(arcs.length).toBeGreaterThan(0);
    expect(arcs.every((d) => d.to?.x === 100 && (d.duration ?? 0) > 0)).toBe(true);

    const floating = setup();
    floating.layer.fault({ at: origin, intensity: 1 });
    floating.advance(30);
    expect(floating.seen.some((d) => d.kind === 'arc')).toBe(false);
  });

  it('stays live while faulting and settles after the fault stops', () => {
    const { layer, advance } = setup();
    const fault = layer.fault({ at: origin, intensity: 1 });
    advance(0.5);
    expect(layer.live).toBe(true);
    fault.stop();
    advance(3);
    expect(layer.live).toBe(false);
  });

  it('is not live while its only fault waits at zero', () => {
    const { layer, advance } = setup();
    const fault = layer.fault({ at: origin });
    advance(0.1);
    expect(layer.live).toBe(false);
    fault.intensity = 0.5;
    expect(layer.live).toBe(true);
  });

  it('ignores intensity written after a stop', () => {
    const { layer, seen, advance } = setup();
    const fault = layer.fault({ at: origin, intensity: 1 });
    fault.stop();
    fault.intensity = 1;
    advance(3);
    const late = seen.length;
    advance(2);
    expect(seen.length).toBe(late);
  });

  it('jolts only past the jolt threshold, harder toward full intensity', () => {
    const animate = vi.fn(() => ({ cancel() {}, finished: Promise.resolve(), onfinish: null }));
    const element = { animate } as unknown as Element;
    const calm = setup({ jolt: element, tuning: { jolt: { from: 0.9 } } });
    calm.layer.fault({ at: origin, intensity: 0.85 });
    calm.advance(30);
    expect(calm.seen.length).toBeGreaterThan(0);
    expect(animate).not.toHaveBeenCalled();

    const strained = setup({ jolt: element, tuning: { jolt: { from: 0.9 } } });
    strained.layer.fault({ at: origin, intensity: 1 });
    strained.advance(10);
    expect(animate).toHaveBeenCalled();
  });

  it('clamps one-shot energy', () => {
    const { layer, seen } = setup();
    layer.burst(origin, 5);
    layer.sputter(origin, -1);
    layer.shower(origin, Number.NaN);
    expect(seen.map((d) => d.energy)).toEqual([1, 0, 0]);
  });

  it('gives a one-shot arc its landing point and a duration', () => {
    const { layer, seen } = setup();
    layer.arc(origin, { x: 50, y: 0, z: 0 }, 1);
    expect(seen[0]).toMatchObject({ kind: 'arc', to: { x: 50 }, energy: 1 });
    expect(seen[0]?.duration).toBeCloseTo(0.22);
  });

  it('repeats a seed’s discharges', () => {
    const run = () => {
      const { layer, seen, advance } = setup({ seed: 9 });
      layer.fault({ at: origin, intensity: 0.8 });
      advance(3);
      return seen.map((d) => `${d.kind}:${d.energy}`);
    };
    expect(run()).toEqual(run());
  });

  it('detaches and goes quiet on dispose', () => {
    const { layer, seen, advance } = setup();
    layer.fault({ at: origin, intensity: 1 });
    advance(0.5);
    layer.dispose();
    const count = seen.length;
    advance(1);
    layer.burst(origin);
    expect(seen.length).toBe(count);
    expect(layer.object.parent).toBeNull();
    expect(layer.live).toBe(false);
  });
});
