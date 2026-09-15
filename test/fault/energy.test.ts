import { describe, expect, it } from 'vitest';
import { drawEnergy, kindFor } from '../../src/fault/energy.js';
import { DEFAULT_TUNING as T } from '../../src/fault/tuning.js';
import { mulberry32 } from '../../src/rng.js';

function meanEnergy(k: number): number {
  const rng = mulberry32(3);
  let sum = 0;
  for (let i = 0; i < 10000; i++) sum += drawEnergy(rng(), k, T);
  return sum / 10000;
}

describe('drawEnergy', () => {
  it('has a floor that rises with intensity', () => {
    expect(drawEnergy(0, 0.5, T)).toBeCloseTo(0.05);
    expect(drawEnergy(0, 1, T)).toBeCloseTo(0.1);
  });

  it('caps at 1', () => {
    expect(drawEnergy(1, 1, T)).toBe(1);
  });

  it('shifts the whole distribution up with intensity', () => {
    const [low, mid, high] = [meanEnergy(0.1), meanEnergy(0.5), meanEnergy(1)];
    expect(low).toBeLessThan(mid);
    expect(mid).toBeLessThan(high);
  });

  it('is mostly small even at full intensity', () => {
    const rng = mulberry32(4);
    let small = 0;
    for (let i = 0; i < 10000; i++) if (drawEnergy(rng(), 1, T) < T.sputterBelow) small++;
    expect(small / 10000).toBeGreaterThan(0.4);
  });
});

describe('kindFor', () => {
  it('sorts discharges by energy', () => {
    expect(kindFor(0.2, false, 0.9, T)).toBe('sputter');
    expect(kindFor(0.5, false, 0.9, T)).toBe('burst');
    expect(kindFor(0.7, false, 0.9, T)).toBe('shower');
  });

  it('arcs a share of the energetic discharges when it can', () => {
    expect(kindFor(0.5, true, 0.4, T)).toBe('arc');
    expect(kindFor(0.5, true, 0.6, T)).toBe('burst');
    expect(kindFor(0.3, true, 0.1, T)).toBe('burst');
  });

  it('never arcs without somewhere to land', () => {
    expect(kindFor(0.9, false, 0, T)).toBe('shower');
  });
});
