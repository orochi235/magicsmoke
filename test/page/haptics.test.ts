// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Haptics } from '../../src/page/haptics.js';

const stub = (name: string, value: unknown) =>
  Object.defineProperty(navigator, name, { configurable: true, value });

describe('Haptics', () => {
  let now = 1000;
  let vibrate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vibrate = vi.fn(() => true);
    stub('vibrate', vibrate);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    stub('vibrate', undefined);
    stub('userActivation', undefined);
  });

  it('does nothing before a user activation', () => {
    stub('userActivation', { hasBeenActive: false });
    new Haptics().pulse(1);
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('vibrates for 10 + 40 * energy ms after activation', () => {
    stub('userActivation', { hasBeenActive: true });
    new Haptics().pulse(0.5);
    expect(vibrate).toHaveBeenCalledWith(30);
  });

  it('drops a pulse within 50 ms of the last one', () => {
    stub('userActivation', { hasBeenActive: true });
    const haptics = new Haptics();
    haptics.pulse(0.5);
    now += 30;
    haptics.pulse(0.5);
    expect(vibrate).toHaveBeenCalledTimes(1);
    now += 30;
    haptics.pulse(1);
    expect(vibrate).toHaveBeenCalledTimes(2);
    expect(vibrate).toHaveBeenLastCalledWith(50);
  });

  it('does not throw where vibrate is missing', () => {
    stub('vibrate', undefined);
    stub('userActivation', { hasBeenActive: true });
    expect(() => new Haptics().pulse(1)).not.toThrow();
  });
});
