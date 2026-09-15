import {
  type ConfigShape,
  f,
  type ResolvedConfig,
  resolveConfigSchema,
  valueAtPath,
} from '@weasel-js/labkit';
import type { ParamSpec } from '../../src/index.js';

/** Anything shaped like `TUNING_SCHEMA`: labeled groups of labeled numbers. */
export interface ParamGroups {
  readonly [group: string]: {
    readonly label: string;
    readonly params: { readonly [key: string]: ParamSpec };
  };
}

/**
 * labkit's controls for a `TUNING_SCHEMA`-shaped description: one `f.group` per group, so each
 * value sits at `group.key`, the same path it has in the tuning object.
 */
export function controlsFor(groups: ParamGroups, defaults: unknown): ResolvedConfig {
  const shape: Record<string, ConfigShape[string]> = {};
  for (const [group, { label, params }] of Object.entries(groups)) {
    const leaves: Record<string, ConfigShape[string]> = {};
    for (const [key, spec] of Object.entries(params)) {
      const fallback = valueAtPath(defaults, `${group}.${key}`);
      let leaf = f
        .number(typeof fallback === 'number' ? fallback : spec.min)
        .range(spec.min, spec.max)
        .step(spec.step)
        .label(spec.label);
      if (spec.hint) leaf = leaf.describe(spec.hint);
      leaves[key] = leaf;
    }
    shape[group] = f.group(leaves).label(label);
  }
  return resolveConfigSchema(f.schema(shape));
}
