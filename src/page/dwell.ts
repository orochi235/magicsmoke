export interface DwellSpec {
  rise: number;
  /** Milliseconds to build under a finger, which rests only briefly. Defaults to `rise`. */
  touchRise?: number;
  fall: number;
  /**
   * CSS pixels of pointer travel that cost the whole value, so the value measures how long the
   * pointer has stayed in one place rather than over the element at all. Default 200; `Infinity`
   * leaves movement free.
   */
  drain?: number;
}

const DEFAULT_DRAIN = 200;

export interface Dwell {
  readonly value: number;
  readonly x: number;
  readonly y: number;
  onChange(listener: (dwell: Dwell) => void): () => void;
  dispose(): void;
}

export function dwell(element: Element, spec: DwellSpec): Dwell {
  const listeners = new Set<(dwell: Dwell) => void>();
  let value = 0;
  let x = 0;
  let y = 0;
  let target = 0;
  // Units per ms. A fall covers whatever value is left in `fall` ms, so it always lasts that long.
  let rate = 0;
  let last = 0;
  let frame: number | null = null;
  // Whether x and y were seen during this visit, so a return is not charged for the trip back.
  let anchored = false;
  const drain = spec.drain ?? DEFAULT_DRAIN;
  let rise = spec.rise;

  const state: Dwell = {
    get value() {
      return value;
    },
    get x() {
      return x;
    },
    get y() {
      return y;
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      element.removeEventListener('pointerenter', enter);
      element.removeEventListener('pointerleave', leave);
      element.removeEventListener('pointercancel', leave);
      element.removeEventListener('pointermove', move);
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      listeners.clear();
    },
  };

  const notify = () => {
    for (const listener of [...listeners]) listener(state);
  };

  const advance = (now: number): boolean => {
    const before = value;
    const step = rate * (now - last);
    last = now;
    value = target > value ? Math.min(target, value + step) : Math.max(target, value - step);
    return value !== before;
  };

  const tick = () => {
    frame = null;
    if (advance(performance.now())) notify();
    if (value !== target) frame = requestAnimationFrame(tick);
  };

  const head = (next: number) => {
    const now = performance.now();
    const changed = frame !== null && advance(now);
    last = now;
    target = next;
    rate = next === 1 ? 1 / Math.max(rise, 1) : value / Math.max(spec.fall, 1);
    if (changed) notify();
    if (value !== target && frame === null) frame = requestAnimationFrame(tick);
  };

  const track = (event: Event): boolean => {
    if (!(event instanceof MouseEvent)) return false;
    if (event.clientX === x && event.clientY === y) return false;
    x = event.clientX;
    y = event.clientY;
    return true;
  };

  function enter(event: Event) {
    const touch = (event as { pointerType?: string }).pointerType === 'touch';
    rise = touch && spec.touchRise !== undefined ? spec.touchRise : spec.rise;
    if (track(event)) notify();
    anchored = event instanceof MouseEvent;
    head(1);
  }

  function leave() {
    anchored = false;
    head(0);
  }

  function move(event: Event) {
    const fromX = x;
    const fromY = y;
    const wasAnchored = anchored;
    if (!track(event)) return;
    anchored = true;
    if (wasAnchored && Number.isFinite(drain) && drain > 0) {
      if (frame !== null) advance(performance.now());
      last = performance.now();
      value = Math.max(0, value - Math.hypot(x - fromX, y - fromY) / drain);
      if (value !== target && frame === null) frame = requestAnimationFrame(tick);
    }
    notify();
  }

  element.addEventListener('pointerenter', enter);
  element.addEventListener('pointerleave', leave);
  // A touch the browser takes over for scrolling ends in a cancel, not always a leave.
  element.addEventListener('pointercancel', leave);
  element.addEventListener('pointermove', move);
  return state;
}
