/** A point in three.js world space: y up. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** A point in client coordinates: CSS pixels from the viewport's top left, y down. */
export interface Point {
  x: number;
  y: number;
}

export type DischargeKind = 'sputter' | 'burst' | 'shower' | 'arc';

export interface Discharge {
  kind: DischargeKind;
  at: Vec3;
  /** Where an arc lands. Only arcs carry one. */
  to?: Vec3;
  /** Seconds an arc's strike lasts, shared by its ribbon and its buzz. Only arcs carry one. */
  duration?: number;
  /** 0..1 */
  energy: number;
  /** The intensity of the fault that discharged, 0..1. One-shots carry none. */
  intensity?: number;
}
