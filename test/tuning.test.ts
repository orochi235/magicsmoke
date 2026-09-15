import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TUNING,
  type ParamSpec,
  resolveTuning,
  TUNING_SCHEMA,
  type TuningGroup,
} from '../src/tuning.js';

describe('TUNING_SCHEMA', () => {
  it('describes every tunable value, with each default inside its range', () => {
    for (const group of Object.keys(DEFAULT_TUNING) as TuningGroup[]) {
      const values = DEFAULT_TUNING[group] as unknown as Record<string, number>;
      const params = TUNING_SCHEMA[group].params as Record<string, ParamSpec>;
      expect(Object.keys(params).sort(), group).toEqual(Object.keys(values).sort());
      for (const [key, value] of Object.entries(values)) {
        const spec = params[key];
        if (!spec) throw new Error(`${group}.${key} has no spec`);
        expect(value, `${group}.${key}`).toBeGreaterThanOrEqual(spec.min);
        expect(value, `${group}.${key}`).toBeLessThanOrEqual(spec.max);
      }
    }
  });
});

describe('resolveTuning', () => {
  it('lays overrides over the defaults group by group', () => {
    const tuning = resolveTuning({ jolt: { from: 0.9 } });
    expect(tuning.jolt).toEqual({ from: 0.9, amplitude: DEFAULT_TUNING.jolt.amplitude });
    expect(tuning.sparks).toEqual(DEFAULT_TUNING.sparks);
  });

  it('never shares a group with the defaults', () => {
    const tuning = resolveTuning();
    tuning.sparks.count = 9;
    tuning.fault.baseRate = 9;
    expect(DEFAULT_TUNING.sparks.count).toBe(1);
    expect(DEFAULT_TUNING.fault.baseRate).not.toBe(9);
  });
});
