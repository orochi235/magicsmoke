import type { Rng } from '../rng.js';

const STEPS = 8;
const AMPLITUDE_PX = 6;
const SHUDDER_STEP = 0.03;

export class Jolter {
  private readonly element: Element;
  private readonly animations = new Set<Animation>();

  constructor(element: Element) {
    this.element = element;
  }

  /** `amplitude` is CSS pixels at full energy. */
  kick(energy: number, rng: Rng, amplitude = AMPLITUDE_PX): void {
    if (typeof this.element.animate !== 'function') return;
    const keyframes: Keyframe[] = [];
    for (let i = 0; i < STEPS; i++) {
      const reach = amplitude * energy * (1 - i / STEPS);
      const angle = rng() * Math.PI * 2;
      const radius = reach * (0.5 + 0.5 * rng());
      const x = (Math.cos(angle) * radius).toFixed(2);
      const y = (Math.sin(angle) * radius).toFixed(2);
      keyframes.push({ translate: `${x}px ${y}px` });
    }
    keyframes.push({ translate: '0px 0px' });
    this.play(keyframes, 180);
  }

  /**
   * Shakes the element for `seconds`, growing from `start` to `peak` CSS pixels, and snaps it back
   * to rest at the end.
   */
  shudder(seconds: number, start: number, peak: number, rng: Rng): void {
    if (typeof this.element.animate !== 'function' || !(seconds > 0)) return;
    const steps = Math.max(2, Math.round(seconds / SHUDDER_STEP));
    const keyframes: Keyframe[] = [{ translate: '0px 0px' }];
    for (let i = 1; i <= steps; i++) {
      const reach = start + (peak - start) * (i / steps) ** 2;
      const angle = rng() * Math.PI * 2;
      const radius = reach * (0.6 + 0.4 * rng());
      const x = (Math.cos(angle) * radius).toFixed(2);
      const y = (Math.sin(angle) * radius).toFixed(2);
      keyframes.push({ translate: `${x}px ${y}px` });
    }
    keyframes.push({ translate: '0px 0px' });
    this.play(keyframes, (seconds + SHUDDER_STEP) * 1000);
  }

  dispose(): void {
    for (const animation of this.animations) animation.cancel();
    this.animations.clear();
  }

  private play(keyframes: Keyframe[], duration: number): void {
    const animation = this.element.animate(keyframes, {
      duration,
      composite: 'add',
      easing: 'linear',
    });
    this.animations.add(animation);
    const forget = () => this.animations.delete(animation);
    animation.finished.then(forget, forget);
  }
}
