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
    count: [1, 4],
    speed: [40, 380],
    life: [0.15, 0.6],
    size: [3, 5],
    dragTo: 0.6,
    gravity: 900,
    bounces: true,
  },
  burst: {
    count: [4, 12],
    speed: [250, 700],
    life: [0.25, 0.6],
    size: [6, 10],
    dragTo: 0.3,
    gravity: 500,
    bounces: false,
  },
  shower: {
    count: [60, 120],
    speed: [150, 600],
    life: [0.5, 1.4],
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
