import { level } from 'blits';
import { Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { createLayer, type Fault } from '../src/layer.js';
import { mulberry32 } from '../src/rng.js';
import { createSmoke, type FaultHandle, fault } from '../src/smoke.js';
import type { Discharge, Vec3 } from '../src/types.js';

/** What a script does to one fault, the same on either engine. */
interface Driver {
  set(intensity: number): void;
  blow(peak: number, after: number): void;
  stop(): void;
}

interface Engine {
  fault(at: Vec3, to: Vec3 | null, intensity: number): Driver;
  burst(at: Vec3, energy: number): void;
  frame(gapMs: number): void;
  readonly live: boolean;
}

interface Seen {
  frame: number;
  d: Discharge;
}

function oldEngine(seed: number, seen: Seen[], frame: () => number): Engine {
  const layer = createLayer({ seed, onDischarge: (d) => seen.push({ frame: frame(), d }) });
  new Scene().add(layer.object);
  const drive = (f: Fault): Driver => ({
    set: (v) => {
      f.intensity = v;
    },
    blow: (peak, after) => f.blow({ peak, after }),
    stop: () => f.stop(),
  });
  return {
    fault: (at, to, intensity) => drive(layer.fault({ at, to: to ?? undefined, intensity })),
    burst: (at, energy) => layer.burst(at, energy),
    frame: (gap) => layer.update(gap / 1000),
    get live() {
      return layer.live;
    },
  };
}

function newEngine(seed: number, seen: Seen[], frame: () => number, signal = false): Engine {
  const smoke = createSmoke({ seed, onDischarge: (d) => seen.push({ frame: frame(), d }) });
  new Scene().add(smoke.object);
  let clock = 0;
  smoke.sync(clock);
  const drive = (f: FaultHandle): Driver => ({
    set: (v) => {
      f.weight = v;
    },
    blow: (peak, after) => f.blow({ peak, after }),
    stop: () => f.fade(),
  });
  return {
    fault: (at, to, intensity) => {
      if (!signal) return drive(smoke.cue(fault({ at, to }), { weight: intensity }));
      const weight = level(intensity);
      const f = smoke.cue(fault({ at, to }), { weight });
      return { ...drive(f), set: (v) => weight.set(v) };
    },
    burst: (at, energy) => smoke.burst(at, energy),
    frame: (gap) => {
      clock += gap;
      smoke.sync(clock);
    },
    get live() {
      return smoke.live;
    },
  };
}

type Script = (engine: Engine, frame: number) => void;

function run(
  make: typeof oldEngine | typeof newEngine,
  gaps: readonly number[],
  script: Script,
  seed = 7,
) {
  const seen: Seen[] = [];
  let index = 0;
  const engine = make(seed, seen, () => index);
  const live: boolean[] = [];
  for (; index < gaps.length; index++) {
    script(engine, index);
    engine.frame(gaps[index] as number);
    live.push(engine.live);
  }
  return { seen, live };
}

/**
 * The old engine is handed each gap and the new one a clock summed from them, so a value derived
 * from elapsed time can differ in its last bits; nothing coarser may.
 */
const rounded = (seen: Seen[]) =>
  seen.map(({ frame, d }) => ({
    ...d,
    frame,
    energy: d.energy.toFixed(12),
    intensity: d.intensity?.toFixed(12),
  }));

function expectParity(
  gaps: readonly number[],
  script: Script,
  seed?: number,
  make: typeof newEngine = newEngine,
) {
  const before = run(oldEngine, gaps, script, seed);
  const after = run(make, gaps, script, seed);
  expect(before.seen.length).toBeGreaterThan(0);
  expect(rounded(after.seen)).toEqual(rounded(before.seen));
  expect(after.live).toEqual(before.live);
  return before;
}

const steady = (fps: number, seconds: number) =>
  new Array<number>(Math.round(fps * seconds)).fill(1000 / fps);

/** Frame gaps from 4 to 50 ms, the same every run. */
function jittered(count: number, seed: number): number[] {
  const rng = mulberry32(seed);
  return Array.from({ length: count }, () => 4 + rng() * 46);
}

const A = { x: 0, y: 0, z: 0 };
const B = { x: 120, y: -40, z: 0 };
const C = { x: -60, y: 30, z: 0 };

describe('the blits engine against the old one', () => {
  for (const fps of [30, 60, 120, 144]) {
    it(`throws the same discharges from a fault held steady at ${fps} fps`, () => {
      let f: Driver;
      expectParity(steady(fps, 6), (e, i) => {
        if (i === 0) f = e.fault(A, B, 0.7);
        if (i === Math.round(fps * 2)) f.set(1);
      });
    });
  }

  it('follows an intensity written every frame, over jittered frames', () => {
    let f: Driver;
    expectParity(jittered(600, 3), (e, i) => {
      if (i === 0) f = e.fault(A, null, 0);
      f.set(0.5 + 0.5 * Math.sin(i / 40));
    });
  });

  it('keeps several faults, cued at different frames, apart', () => {
    let faults: Driver[] = [];
    expectParity(steady(60, 8), (e, i) => {
      if (i === 0) faults = [e.fault(A, B, 0.8)];
      if (i === 45) faults.push(e.fault(B, null, 0.6));
      if (i === 200) faults.push(e.fault(C, A, 1));
      if (i === 300) faults[0]?.set(0.2);
    });
  });

  it('blows the same way, with the host writing intensity throughout', () => {
    let f: Driver;
    expectParity(steady(60, 5), (e, i) => {
      if (i === 0) f = e.fault(A, B, 0.6);
      f.set(0.9);
      if (i === 60) f.blow(1000, 300);
    });
  });

  it('winds a stopped fault down the same way and goes quiet on the same frame', () => {
    let f: Driver;
    const { live } = expectParity(steady(60, 4), (e, i) => {
      if (i === 0) f = e.fault(A, B, 1);
      if (i === 120) f.stop();
    });
    expect(live.at(-1)).toBe(false);
  });

  it('interleaves one-shots with a fault the same way', () => {
    expectParity(jittered(400, 11), (e, i) => {
      if (i === 0) e.fault(A, B, 0.9);
      if (i % 37 === 5) e.burst(C, 0.8);
    });
  });

  it('follows a level signal as it follows written intensity', () => {
    let f: Driver;
    const signalled: typeof newEngine = (seed, seen, frame) => newEngine(seed, seen, frame, true);
    expectParity(
      jittered(600, 5),
      (e, i) => {
        if (i === 0) f = e.fault(A, B, 0);
        f.set(Math.min(1, i / 200));
        if (i === 400) f.blow(800, 200);
      },
      7,
      signalled,
    );
  });

  it('takes gaps longer than a step the same way', () => {
    const gaps = steady(60, 6).map((gap, i) => (i % 50 === 25 ? 140 : gap));
    expectParity(gaps, (e, i) => {
      if (i === 0) e.fault(A, B, 0.9);
    });
  });
});
