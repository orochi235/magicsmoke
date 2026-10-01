import { level } from 'blits';
import { Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { createLayer, type Fault } from '../src/layer.js';
import { mulberry32 } from '../src/rng.js';
import { createSmoke, type FaultHandle, fault } from '../src/smoke.js';
import type { Discharge, Vec3 } from '../src/types.js';
import fixture from './regression.json' with { type: 'json' };

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

function layerEngine(seed: number, seen: Seen[], frame: () => number): Engine {
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

function smokeEngine(seed: number, seen: Seen[], frame: () => number, signal = false): Engine {
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

function run(make: Make, gaps: readonly number[], script: Script, seed = 7) {
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

type Make = (seed: number, seen: Seen[], frame: () => number) => Engine;

const ENGINES: Record<string, Make> = {
  layer: layerEngine,
  smoke: smokeEngine,
  signal: (seed, seen, frame) => smokeEngine(seed, seen, frame, true),
};

/**
 * What a run threw, reduced to a digest. Energies and intensities are rounded to 12 places: the
 * layer API is handed each gap and `createSmoke` a clock summed from them, so a value derived from
 * elapsed time can differ in its last bits; nothing coarser may.
 */
async function digest(gaps: readonly number[], script: Script, make: Make, seed?: number) {
  const { seen, live } = run(make, gaps, script, seed);
  const rows = seen.map(({ frame, d }) => ({
    ...d,
    frame,
    energy: d.energy.toFixed(12),
    intensity: d.intensity?.toFixed(12),
  }));
  const bytes = new TextEncoder().encode(JSON.stringify({ rows, live }));
  const sum = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const hash = Array.from(sum, (b) => b.toString(16).padStart(2, '0')).join('');
  return { count: rows.length, hash, quiet: live.at(-1) === false };
}

/**
 * Recorded 2026-09-30 from the engine magicsmoke ran before blits, which is gone; it cannot be
 * recorded again, only reproduced. Every engine below has to match it exactly.
 */
const recorded: Record<string, { count: number; hash: string; quiet: boolean }> = fixture;

async function expectRecorded(
  name: string,
  gaps: readonly number[],
  script: Script,
  seed?: number,
) {
  const want = recorded[name];
  expect(want?.count).toBeGreaterThan(0);
  for (const [engine, make] of Object.entries(ENGINES)) {
    expect({ engine, ...(await digest(gaps, script, make, seed)) }).toEqual({ engine, ...want });
  }
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

describe('every engine against the recorded sequences', () => {
  for (const fps of [30, 60, 120, 144]) {
    it(`throws the recorded discharges from a fault held steady at ${fps} fps`, async () => {
      let f: Driver;
      await expectRecorded(`steady ${fps}`, steady(fps, 6), (e, i) => {
        if (i === 0) f = e.fault(A, B, 0.7);
        if (i === Math.round(fps * 2)) f.set(1);
      });
    });
  }

  it('follows an intensity written every frame, over jittered frames', async () => {
    let f: Driver;
    await expectRecorded('written', jittered(600, 3), (e, i) => {
      if (i === 0) f = e.fault(A, null, 0);
      f.set(0.5 + 0.5 * Math.sin(i / 40));
    });
  });

  it('keeps several faults, cued at different frames, apart', async () => {
    let faults: Driver[] = [];
    await expectRecorded('several', steady(60, 8), (e, i) => {
      if (i === 0) faults = [e.fault(A, B, 0.8)];
      if (i === 45) faults.push(e.fault(B, null, 0.6));
      if (i === 200) faults.push(e.fault(C, A, 1));
      if (i === 300) faults[0]?.set(0.2);
    });
  });

  it('blows, with the host writing intensity throughout', async () => {
    let f: Driver;
    await expectRecorded('blow', steady(60, 5), (e, i) => {
      if (i === 0) f = e.fault(A, B, 0.6);
      f.set(0.9);
      if (i === 60) f.blow(1000, 300);
    });
  });

  it('winds a stopped fault down and goes quiet', async () => {
    let f: Driver;
    await expectRecorded('stop', steady(60, 4), (e, i) => {
      if (i === 0) f = e.fault(A, B, 1);
      if (i === 120) f.stop();
    });
    expect(recorded.stop?.quiet).toBe(true);
  });

  it('interleaves one-shots with a fault', async () => {
    await expectRecorded('one-shots', jittered(400, 11), (e, i) => {
      if (i === 0) e.fault(A, B, 0.9);
      if (i % 37 === 5) e.burst(C, 0.8);
    });
  });

  it('ramps up, then blows', async () => {
    let f: Driver;
    await expectRecorded('ramp and blow', jittered(600, 5), (e, i) => {
      if (i === 0) f = e.fault(A, B, 0);
      f.set(Math.min(1, i / 200));
      if (i === 400) f.blow(800, 200);
    });
  });

  it('takes gaps longer than a step', async () => {
    const gaps = steady(60, 6).map((gap, i) => (i % 50 === 25 ? 140 : gap));
    await expectRecorded('long gaps', gaps, (e, i) => {
      if (i === 0) e.fault(A, B, 0.9);
    });
  });
});
