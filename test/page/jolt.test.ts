// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { Jolter } from '../../src/page/jolt.js';
import { mulberry32 } from '../../src/rng.js';

const fakeAnimation = (finished: Promise<unknown> = new Promise(() => {})) => ({
  cancel: vi.fn(),
  finished,
});

function stubbed() {
  const element = document.createElement('div');
  const animation = fakeAnimation();
  const animate = vi.fn((_keyframes: Keyframe[], _options: KeyframeAnimationOptions) => animation);
  Object.defineProperty(element, 'animate', { configurable: true, value: animate });
  return { element, animate, animation };
}

function offsets(animate: ReturnType<typeof vi.fn>): number[] {
  const keyframes = animate.mock.calls[0]?.[0] as Keyframe[];
  return keyframes.flatMap((frame) =>
    String(frame.translate)
      .split(' ')
      .map((part) => Math.abs(Number.parseFloat(part))),
  );
}

describe('Jolter', () => {
  it('plays one additive translate track that settles at the origin', () => {
    const { element, animate } = stubbed();
    new Jolter(element).kick(1, mulberry32(1));
    expect(animate).toHaveBeenCalledTimes(1);
    expect(animate).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ duration: 180, composite: 'add' }),
    );
    const keyframes = animate.mock.calls[0]?.[0] ?? [];
    expect(keyframes.length).toBeGreaterThan(1);
    for (const frame of keyframes) expect(Object.keys(frame)).toEqual(['translate']);
    expect(keyframes.at(-1)?.translate).toBe('0px 0px');
    expect(Math.max(...offsets(animate))).toBeLessThanOrEqual(6);
  });

  it('scales amplitude by energy', () => {
    const { element, animate } = stubbed();
    new Jolter(element).kick(0.5, mulberry32(1));
    expect(Math.max(...offsets(animate))).toBeLessThanOrEqual(3);
  });

  it('shudders harder toward the end of a shudder and settles at the origin', () => {
    const { element, animate } = stubbed();
    new Jolter(element).shudder(1, 6, 24, mulberry32(1));
    expect(animate).toHaveBeenCalledTimes(1);
    const [keyframes = [], options] = animate.mock.calls[0] ?? [];
    expect(options).toMatchObject({ composite: 'add' });
    expect(Number(options?.duration)).toBeCloseTo(1030);
    expect(keyframes[0]?.translate).toBe('0px 0px');
    expect(keyframes.at(-1)?.translate).toBe('0px 0px');
    const radii = keyframes.slice(1, -1).map((frame) => {
      const [x = 0, y = 0] = String(frame.translate).split(' ').map(Number.parseFloat);
      return Math.hypot(x, y);
    });
    const quarter = Math.floor(radii.length / 4);
    expect(Math.max(...radii)).toBeLessThanOrEqual(24);
    expect(Math.max(...radii.slice(0, quarter))).toBeLessThan(Math.min(...radii.slice(-quarter)));
  });

  it('does not shudder for no time', () => {
    const { element, animate } = stubbed();
    new Jolter(element).shudder(0, 6, 24, mulberry32(1));
    expect(animate).not.toHaveBeenCalled();
  });

  it('cancels unfinished animations on dispose', () => {
    const { element, animation } = stubbed();
    const jolter = new Jolter(element);
    jolter.kick(1, mulberry32(1));
    jolter.dispose();
    expect(animation.cancel).toHaveBeenCalled();
  });

  it('forgets animations once they finish', async () => {
    const element = document.createElement('div');
    const animation = fakeAnimation(Promise.resolve());
    Object.defineProperty(element, 'animate', { configurable: true, value: () => animation });
    const jolter = new Jolter(element);
    jolter.kick(1, mulberry32(1));
    await animation.finished;
    await Promise.resolve();
    jolter.dispose();
    expect(animation.cancel).not.toHaveBeenCalled();
  });

  it('does not throw without element.animate', () => {
    const element = document.createElement('div');
    Object.defineProperty(element, 'animate', { configurable: true, value: undefined });
    expect(() => new Jolter(element).kick(1, mulberry32(1))).not.toThrow();
  });
});
