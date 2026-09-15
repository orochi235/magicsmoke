import { describe, expect, it } from 'vitest';
import { above, opens, strength } from '../src/gates.js';
import type { Discharge } from '../src/types.js';

const at = { x: 0, y: 0, z: 0 };
const fault = (intensity: number, energy = 0.3): Discharge => ({
  kind: 'burst',
  at,
  energy,
  intensity,
});
const oneShot = (energy: number): Discharge => ({ kind: 'burst', at, energy });

describe('above', () => {
  it('ramps from 0 at the threshold to 1 at full intensity', () => {
    expect(above(0.5, 0.5)).toBe(0);
    expect(above(0.75, 0.5)).toBeCloseTo(0.5);
    expect(above(1, 0.5)).toBe(1);
    expect(above(0.2, 0.5)).toBe(0);
  });

  it('is intensity itself with no threshold, and never opens at a threshold of 1', () => {
    expect(above(0.3, 0)).toBeCloseTo(0.3);
    expect(above(1, 1)).toBe(0);
  });
});

describe('opens', () => {
  it('holds a fault back until its intensity passes the threshold', () => {
    expect(opens(fault(0.5), 0.5)).toBe(false);
    expect(opens(fault(0.51), 0.5)).toBe(true);
  });

  it('never holds a one-shot back', () => {
    expect(opens(oneShot(0.1), 0.99)).toBe(true);
  });
});

describe('strength', () => {
  it('follows a fault’s intensity past the threshold and a one-shot’s energy', () => {
    expect(strength(fault(0.95, 0.1), 0.9)).toBeCloseTo(0.5);
    expect(strength(oneShot(0.4), 0.9)).toBe(0.4);
  });
});
