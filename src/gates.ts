import type { Discharge } from './types.js';

const clamp01 = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));

/** Intensity remapped past a threshold: 0 at `from`, 1 at full. */
export function above(k: number, from: number): number {
  return from >= 1 ? 0 : clamp01((k - from) / (1 - from));
}

/** Whether an effect with threshold `from` answers this discharge. One-shots always do. */
export function opens(d: Discharge, from: number): boolean {
  return d.intensity === undefined || d.intensity > from;
}

/** How hard an effect answers: a fault's intensity past `from`, or a one-shot's energy. */
export function strength(d: Discharge, from: number): number {
  return d.intensity === undefined ? d.energy : above(d.intensity, from);
}
