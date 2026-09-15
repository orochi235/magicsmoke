import { describe, expect, it } from 'vitest';
import { MEAN_GAP, MIN_GAP, PopGate } from '../../src/audio/pop-gate.js';
import { mulberry32 } from '../../src/rng.js';
import type { DischargeKind } from '../../src/types.js';

/** Pop times from a kind discharging `perSecond` for `seconds`. */
function pops(kind: DischargeKind, perSecond: number, seconds: number): number[] {
  const gate = new PopGate(mulberry32(11));
  const times: number[] = [];
  for (let i = 0; i < perSecond * seconds; i++) {
    const now = i / perSecond;
    if (gate.allow(kind, now)) times.push(now);
  }
  return times;
}

const gapsOf = (times: number[]) => times.slice(1).map((t, i) => t - (times[i] ?? 0));

describe('PopGate', () => {
  it('pops about as often at a fast discharge rate as at a moderate one', () => {
    const moderate = pops('burst', 12, 120).length;
    const fast = pops('burst', 60, 120).length;
    expect(Math.abs(fast - moderate) / moderate).toBeLessThan(0.25);
    expect(fast / 120).toBeLessThan(1.3 / MEAN_GAP);
  });

  it('never pops twice inside the minimum gap', () => {
    expect(Math.min(...gapsOf(pops('sputter', 60, 60)))).toBeGreaterThanOrEqual(MIN_GAP - 1e-9);
  });

  it('spaces pops irregularly', () => {
    const gaps = gapsOf(pops('burst', 60, 120));
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const sd = Math.sqrt(gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / gaps.length);
    expect(sd / mean).toBeGreaterThan(0.5);
  });

  it('always pops a shower', () => {
    const gate = new PopGate(mulberry32(1));
    expect(gate.allow('burst', 0)).toBe(true);
    expect(gate.allow('burst', 0.01)).toBe(false);
    expect(gate.allow('shower', 0.02)).toBe(true);
  });
});
