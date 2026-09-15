import type { DischargeKind } from '../types.js';

export type SparkKind = Exclude<DischargeKind, 'arc'> | 'fizz';

/** Every length is in CSS pixels, multiplied by the layer's `scale`. */
export interface SparkSpec {
  /** Particles at energy 0 and at energy 1. */
  count: readonly [number, number];
  speed: readonly [number, number];
  life: readonly [number, number];
  size: readonly [number, number];
  /** The speed multiplier a particle reaches by the end of its life. Lower is heavier drag. */
  dragTo: number;
  gravity: number;
  bounces: boolean;
}

export const SPARKS: Readonly<Record<SparkKind, SparkSpec>> = {
  sputter: {
    count: [3, 14],
    speed: [40, 380],
    life: [0.15, 0.7],
    size: [3, 5],
    dragTo: 0.6,
    gravity: 900,
    bounces: true,
  },
  burst: {
    count: [20, 40],
    speed: [350, 900],
    life: [0.12, 0.35],
    size: [4, 7],
    dragTo: 0.15,
    gravity: 250,
    bounces: false,
  },
  shower: {
    count: [40, 90],
    speed: [120, 520],
    life: [0.4, 1.3],
    size: [4, 7],
    dragTo: 0.6,
    gravity: 900,
    bounces: true,
  },
  fizz: {
    count: [1, 1],
    speed: [40, 240],
    life: [0.15, 0.55],
    size: [2.5, 4],
    dragTo: 0.7,
    gravity: 700,
    bounces: true,
  },
};
