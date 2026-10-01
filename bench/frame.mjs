// Per-frame CPU cost of each engine, with no WebGL: faults stepping, discharges rendered into the
// particle systems, particles advanced. Run with `npm run bench`, which builds dist first. Rows
// print as they finish; `gc` counts collections during the timed frames.
import { PerformanceObserver } from 'node:perf_hooks';
import { Scene } from 'three';
import { createLayer, createSmoke, fault } from '../dist/index.js';

let gcs = 0;
new PerformanceObserver((list) => {
  gcs += list.getEntries().length;
}).observe({ entryTypes: ['gc'] });

const GAP = 1000 / 60;
const WARM = 60;
const FRAMES = 600;
const at = (i) => ({ x: (i % 20) * 40, y: Math.floor(i / 20) * 40, z: 0 });

/** Builds an engine with `n` faults and returns its frame function. */
const engines = {
  old(n) {
    const layer = createLayer({ seed: 1 });
    new Scene().add(layer.object);
    for (let i = 0; i < n; i++) layer.fault({ at: at(i), to: at(i + 1), intensity: 0.6 });
    return () => layer.update(GAP / 1000);
  },
  blits(n) {
    const smoke = createSmoke({ seed: 1 });
    new Scene().add(smoke.object);
    let t = 0;
    smoke.sync(t);
    for (let i = 0; i < n; i++) smoke.cue(fault({ at: at(i), to: at(i + 1) }), { weight: 0.6 });
    return () => {
      t += GAP;
      smoke.sync(t);
    };
  },
};

const rows = [1, 10, 100].flatMap((n) => [
  ['old', n],
  ['blits', n],
]);

const idle = () => new Promise((r) => setTimeout(r, 0));
for (const [i, [name, n]] of rows.entries()) {
  const frame = engines[name](n);
  for (let f = 0; f < WARM; f++) frame();
  await idle();
  const before = gcs;
  const t0 = performance.now();
  for (let f = 0; f < FRAMES; f++) frame();
  const ms = (performance.now() - t0) / FRAMES;
  await idle();
  console.log(
    `${String(i + 1).padStart(2)}/${rows.length}  ${name.padEnd(5)} faults=${String(n).padStart(3)}` +
      `  ${ms.toFixed(3).padStart(7)} ms/frame  gc ${String(gcs - before).padStart(3)}`,
  );
}
