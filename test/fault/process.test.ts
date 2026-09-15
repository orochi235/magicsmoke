import { describe, expect, it } from 'vitest';
import { type Draft, FaultProcess } from '../../src/fault/process.js';
import { DEFAULT_FAULT_TUNING as T } from '../../src/fault/tuning.js';
import { mulberry32 } from '../../src/rng.js';

function run(k: number, seconds: number, dt = 1 / 60, seed = 42): Draft[] {
  const process = new FaultProcess(mulberry32(seed));
  process.target = k;
  const drafts: Draft[] = [];
  const frames = Math.round(seconds / dt);
  for (let i = 0; i < frames; i++) drafts.push(...process.step(dt));
  return drafts;
}

describe('FaultProcess', () => {
  it('stays silent at zero intensity', () => {
    expect(run(0, 60)).toHaveLength(0);
  });

  it.each([0.1, 0.5, 1])('discharges at about twice the base rate at k = %s', (k) => {
    const expected = 2 * (T.baseRate + T.rateCurve * k * k);
    const rate = run(k, 600).length / 600;
    expect(Math.abs(rate - expected) / expected).toBeLessThan(0.15);
  });

  it('bunches discharges more than a Poisson process would', () => {
    const times = run(0.5, 600).map((d) => d.time);
    const gaps = times.slice(1).map((t, i) => t - (times[i] ?? 0));
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const sd = Math.sqrt(gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / gaps.length);
    expect(sd / mean).toBeGreaterThan(1.1);
  });

  it('produces the same sequence however frames are chunked', () => {
    const a = run(0.8, 10, 0.01);
    const b = run(0.8, 10, 0.016);
    expect(a.length).toBe(b.length);
    a.forEach((draft, i) => {
      expect(b[i]?.kind).toBe(draft.kind);
      expect(b[i]?.energy).toBe(draft.energy);
      expect(b[i]?.time).toBeCloseTo(draft.time, 9);
    });
  });

  it('advances at most 50 ms per step', () => {
    const process = new FaultProcess(mulberry32(1));
    process.target = 1;
    process.step(5);
    expect(process.now).toBeCloseTo(0.05, 9);
  });

  it('eases intensity toward its target', () => {
    const process = new FaultProcess(mulberry32(1));
    process.target = 1;
    for (let i = 0; i < 20; i++) process.step(0.005);
    expect(process.level).toBeCloseTo(1 - Math.exp(-1), 2);
    for (let i = 0; i < 40; i++) process.step(0.005);
    expect(process.level).toBeCloseTo(1 - Math.exp(-3), 2);
  });

  it('spaces showers at least the cooldown apart', () => {
    const showers = run(1, 600)
      .filter((d) => d.kind === 'shower')
      .map((d) => d.time);
    expect(showers.length).toBeGreaterThan(20);
    const gaps = showers.slice(1).map((t, i) => t - (showers[i] ?? 0));
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(T.showerCooldown - 1e-9);
  });

  it('throws mostly small discharges even at full intensity', () => {
    const drafts = run(1, 600);
    const small = drafts.filter((d) => d.kind === 'sputter').length;
    expect(small / drafts.length).toBeGreaterThan(0.6);
  });

  it('keeps one seed’s sequence stable', () => {
    const drafts = run(0.7, 5, 1 / 60, 7)
      .slice(0, 20)
      .map((d) => `${d.kind} ${d.energy.toFixed(6)} ${d.time.toFixed(3)}`);
    expect(drafts).toMatchSnapshot();
  });
});
