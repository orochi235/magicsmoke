import { describe, expect, it } from 'vitest';
import { AudioEngine } from '../../src/audio/engine.js';
import { mulberry32 } from '../../src/rng.js';
import type { DischargeKind } from '../../src/types.js';

describe('AudioEngine without Web Audio', () => {
  it('constructs locked and treats every call as a no-op', () => {
    expect(typeof AudioContext).toBe('undefined');
    const engine = new AudioEngine({}, mulberry32(1));
    expect(engine.unlocked).toBe(false);
    expect(engine.volume).toBe(0.8);
    expect(() => {
      const kinds: DischargeKind[] = ['sputter', 'burst', 'shower', 'arc'];
      for (const kind of kinds)
        engine.discharge({ kind, at: { x: 0, y: 0, z: 0 }, energy: 0.9 }, 0);
      engine.crackle(4, -0.5);
      engine.setHum(1);
      engine.setHum(0);
      engine.volume = 0.5;
      engine.muted = true;
      engine.dispose();
      engine.dispose();
    }).not.toThrow();
    expect(engine.volume).toBe(0.5);
    expect(engine.muted).toBe(true);
  });

  it('draws one value from the caller rng, whatever audio does later', () => {
    const shared = mulberry32(7);
    const engine = new AudioEngine({}, shared);
    engine.crackle(8, 0);
    const reference = mulberry32(7);
    reference();
    expect(shared()).toBe(reference());
  });
});
