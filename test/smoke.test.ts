import { Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { createSmoke, fault } from '../src/smoke.js';
import type { Discharge } from '../src/types.js';

const origin = { x: 0, y: 0, z: 0 };

function setup() {
  const seen: Discharge[] = [];
  const smoke = createSmoke({ seed: 3, onDischarge: (d) => seen.push(d) });
  new Scene().add(smoke.object);
  let clock = 1000;
  smoke.sync(clock);
  const frames = (count: number, gap = 1000 / 60) => {
    for (let i = 0; i < count; i++) {
      clock += gap;
      smoke.sync(clock);
    }
  };
  return { smoke, seen, frames };
}

describe('createSmoke', () => {
  it('plays a fault at full when cued with no weight', () => {
    const { smoke, seen, frames } = setup();
    smoke.cue(fault({ at: origin }));
    expect(smoke.live).toBe(true);
    frames(120);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((d) => (d.intensity ?? 0) > 0.9)).toBe(true);
  });

  it('is not live for a fault parked at zero, and wakes on a weight write', () => {
    const { smoke, frames } = setup();
    const f = smoke.cue(fault({ at: origin }), { weight: 0 });
    frames(5);
    expect(smoke.live).toBe(false);
    f.weight = 0.5;
    expect(smoke.live).toBe(true);
  });

  it('fades over the time asked, winds down, then removes the voice', async () => {
    const { smoke, seen, frames } = setup();
    const f = smoke.cue(fault({ at: origin }), { weight: 1 });
    frames(60);
    f.fade({ over: 500 });
    expect(f.state).toBe('fading');
    frames(24);
    const late = seen.length;
    frames(6);
    expect(f.state).toBe('fading');
    // 400 ms into a 500 ms ramp the target is under 0.2, and the eased level lags it by 100 ms.
    expect(seen.slice(late).every((d) => (d.intensity ?? 0) < 0.5)).toBe(true);
    frames(60);
    expect(f.state).toBe('done');
    expect(smoke.live).toBe(false);
    await f.done;
  });

  it('takes its fade time from the cue when the fade gives none', () => {
    const { smoke, frames } = setup();
    const f = smoke.cue(fault({ at: origin }), { weight: 1, fade: { out: 1000 } });
    frames(10);
    f.fade();
    frames(30);
    expect(f.state).toBe('fading');
    frames(60);
    expect(f.state).toBe('done');
  });

  it('does not count time a rebase took out', () => {
    const a = setup();
    const b = setup();
    a.smoke.cue(fault({ at: origin }), { weight: 1 });
    b.smoke.cue(fault({ at: origin }), { weight: 1 });
    a.frames(30);
    b.frames(30);
    b.smoke.rebase();
    b.frames(1, 60_000);
    a.frames(1);
    a.frames(60);
    b.frames(60);
    expect(b.seen.length).toBe(a.seen.length);
  });

  it('ignores the weight while blowing and follows it again after', () => {
    const { smoke, frames } = setup();
    const f = smoke.cue(fault({ at: origin }), { weight: 0.4 });
    f.blow({ peak: 200, after: 100 });
    frames(13);
    expect(smoke.live).toBe(true);
    frames(30);
    frames(30);
    expect(smoke.live).toBe(true);
  });
});
