import type { Rng } from '../rng.js';

const STEPS = 8;
const AMPLITUDE_PX = 6;

export class Jolter {
  private readonly element: Element;
  private readonly animations = new Set<Animation>();

  constructor(element: Element) {
    this.element = element;
  }

  kick(energy: number, rng: Rng): void {
    if (typeof this.element.animate !== 'function') return;
    const keyframes: Keyframe[] = [];
    for (let i = 0; i < STEPS; i++) {
      const amplitude = AMPLITUDE_PX * energy * (1 - i / STEPS);
      const angle = rng() * Math.PI * 2;
      const radius = amplitude * (0.5 + 0.5 * rng());
      const x = (Math.cos(angle) * radius).toFixed(2);
      const y = (Math.sin(angle) * radius).toFixed(2);
      keyframes.push({ translate: `${x}px ${y}px` });
    }
    keyframes.push({ translate: '0px 0px' });
    const animation = this.element.animate(keyframes, {
      duration: 180,
      composite: 'add',
      easing: 'linear',
    });
    this.animations.add(animation);
    const forget = () => this.animations.delete(animation);
    animation.finished.then(forget, forget);
  }

  dispose(): void {
    for (const animation of this.animations) animation.cancel();
    this.animations.clear();
  }
}
