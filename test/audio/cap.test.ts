import { describe, expect, it, vi } from 'vitest';
import { VoiceCap } from '../../src/audio/cap.js';

describe('VoiceCap', () => {
  it('admits voices below the cap', () => {
    const cap = new VoiceCap(2);
    expect(cap.admit(0.5, () => {})).not.toBeNull();
    expect(cap.admit(0.1, () => {})).not.toBeNull();
    expect(cap.size).toBe(2);
  });

  it('drops a new voice quieter than every active one', () => {
    const cap = new VoiceCap(2);
    const stops = [vi.fn(), vi.fn()];
    cap.admit(0.5, stops[0] as () => void);
    cap.admit(0.4, stops[1] as () => void);
    expect(cap.admit(0.3, () => {})).toBeNull();
    expect(stops[0]).not.toHaveBeenCalled();
    expect(stops[1]).not.toHaveBeenCalled();
  });

  it('stops the quietest voice for a louder one', () => {
    const cap = new VoiceCap(2);
    const loud = vi.fn();
    const quiet = vi.fn();
    cap.admit(0.9, loud);
    cap.admit(0.2, quiet);
    expect(cap.admit(0.5, () => {})).not.toBeNull();
    expect(quiet).toHaveBeenCalledOnce();
    expect(loud).not.toHaveBeenCalled();
    expect(cap.size).toBe(2);
  });

  it('frees a slot on release', () => {
    const cap = new VoiceCap(1);
    const ticket = cap.admit(0.5, () => {});
    if (!ticket) throw new Error('expected a ticket');
    cap.release(ticket);
    expect(cap.admit(0.1, () => {})).not.toBeNull();
  });
});
