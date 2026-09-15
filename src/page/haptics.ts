const MIN_GAP_MS = 50;

export class Haptics {
  private last = Number.NEGATIVE_INFINITY;

  pulse(energy: number): void {
    const nav = globalThis.navigator;
    if (!nav || typeof nav.vibrate !== 'function') return;
    if (!nav.userActivation?.hasBeenActive) return;
    const now = performance.now();
    if (now - this.last < MIN_GAP_MS) return;
    this.last = now;
    nav.vibrate(Math.round(10 + 40 * energy));
  }
}
