import { describe, expect, it } from 'vitest';
import { fork, mulberry32 } from '../src/rng.js';

const take = (rng: () => number, n: number) => Array.from({ length: n }, () => rng());

describe('mulberry32', () => {
  it('repeats its sequence for a seed', () => {
    expect(take(mulberry32(1), 5)).toEqual(take(mulberry32(1), 5));
  });

  it('stays within [0, 1)', () => {
    const values = take(mulberry32(99), 10000);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThan(1);
  });

  it('differs between seeds', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });
});

describe('fork', () => {
  it('draws a stream apart from its parent', () => {
    const parent = mulberry32(5);
    const child = fork(parent);
    expect(take(child, 5)).not.toEqual(take(parent, 5));
  });

  it('is reproducible from the parent seed', () => {
    expect(take(fork(mulberry32(5)), 3)).toEqual(take(fork(mulberry32(5)), 3));
  });
});
