import { configValueAt, withConfigValueAt } from '@weasel-js/labkit';
import {
  DEFAULT_TUNING,
  TUNING_SCHEMA,
  type Tuning,
  type TuningOverrides,
} from '../../src/index.js';
import type { ParamGroups } from './schema.js';

const groups: ParamGroups = TUNING_SCHEMA;

/** The values in `tuning` that differ from `DEFAULT_TUNING`, by more than half a slider step. */
export function overridesOf(tuning: Tuning): TuningOverrides {
  let out: TuningOverrides = {};
  for (const [group, { params }] of Object.entries(groups)) {
    for (const [key, spec] of Object.entries(params)) {
      const path = `${group}.${key}`;
      const value = configValueAt(tuning, path);
      const fallback = configValueAt(DEFAULT_TUNING, path);
      if (typeof value !== 'number' || typeof fallback !== 'number') continue;
      if (Math.abs(value - fallback) >= spec.step / 2) out = withConfigValueAt(out, path, value);
    }
  }
  return out;
}
