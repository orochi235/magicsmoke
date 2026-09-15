export interface DwellSpec {
  rise: number;
  fall: number;
}

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
    rate = next === 1 ? 1 / Math.max(spec.rise, 1) : value / Math.max(spec.fall, 1);
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
    if (track(event)) notify();
    head(1);
  }

  function leave() {
    head(0);
  }

  function move(event: Event) {
    if (track(event)) notify();
  }

  element.addEventListener('pointerenter', enter);
  element.addEventListener('pointerleave', leave);
  element.addEventListener('pointermove', move);
  return state;
}
