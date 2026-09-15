// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dwell } from '../../src/page/dwell.js';

describe('dwell', () => {
  let element: HTMLDivElement;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    element = document.createElement('div');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('rises linearly over rise ms', () => {
    const d = dwell(element, { rise: 4000, fall: 600 });
    element.dispatchEvent(new Event('pointerenter'));
    vi.advanceTimersByTime(2000);
    expect(d.value).toBeCloseTo(0.5, 1);
    vi.advanceTimersByTime(3000);
    expect(d.value).toBe(1);
  });

  it('falls from where it stands to 0 over fall ms', () => {
    const d = dwell(element, { rise: 4000, fall: 600 });
    element.dispatchEvent(new Event('pointerenter'));
    vi.advanceTimersByTime(2000);
    element.dispatchEvent(new Event('pointerleave'));
    vi.advanceTimersByTime(300);
    expect(d.value).toBeCloseTo(0.25, 1);
    vi.advanceTimersByTime(400);
    expect(d.value).toBe(0);
  });

  it('falls from 1 to 0.5 in half of fall', () => {
    const d = dwell(element, { rise: 4000, fall: 600 });
    element.dispatchEvent(new Event('pointerenter'));
    vi.advanceTimersByTime(5000);
    element.dispatchEvent(new Event('pointerleave'));
    vi.advanceTimersByTime(300);
    expect(d.value).toBeCloseTo(0.5, 1);
  });

  it('falls when the browser takes a touch over for scrolling', () => {
    const d = dwell(element, { rise: 1000, fall: 600 });
    element.dispatchEvent(new Event('pointerenter'));
    vi.advanceTimersByTime(1000);
    element.dispatchEvent(new Event('pointercancel'));
    vi.advanceTimersByTime(700);
    expect(d.value).toBe(0);
  });

  const move = (x: number, y: number) =>
    element.dispatchEvent(new MouseEvent('pointermove', { clientX: x, clientY: y }));

  it('drains by the distance the pointer travels', () => {
    const d = dwell(element, { rise: 1500, fall: 600, drain: 200 });
    element.dispatchEvent(new MouseEvent('pointerenter', { clientX: 0, clientY: 0 }));
    vi.advanceTimersByTime(2000);
    expect(d.value).toBe(1);
    move(100, 0);
    expect(d.value).toBeCloseTo(0.5, 2);
  });

  it('builds back up once the pointer rests again', () => {
    const d = dwell(element, { rise: 1500, fall: 600, drain: 200 });
    element.dispatchEvent(new MouseEvent('pointerenter', { clientX: 0, clientY: 0 }));
    vi.advanceTimersByTime(2000);
    move(200, 0);
    expect(d.value).toBe(0);
    vi.advanceTimersByTime(1600);
    expect(d.value).toBe(1);
  });

  it('barely drains for a hand resting unsteadily', () => {
    const d = dwell(element, { rise: 1500, fall: 600, drain: 200 });
    element.dispatchEvent(new MouseEvent('pointerenter', { clientX: 0, clientY: 0 }));
    vi.advanceTimersByTime(2000);
    for (let i = 1; i <= 10; i++) move(i % 2 ? 2 : 0, 0);
    expect(d.value).toBeGreaterThan(0.85);
  });

  it('lets movement go free with an infinite drain', () => {
    const d = dwell(element, { rise: 1500, fall: 600, drain: Number.POSITIVE_INFINITY });
    element.dispatchEvent(new MouseEvent('pointerenter', { clientX: 0, clientY: 0 }));
    vi.advanceTimersByTime(2000);
    move(5000, 0);
    expect(d.value).toBe(1);
  });

  it('does not charge a return for the trip back', () => {
    const d = dwell(element, { rise: 1500, fall: 600, drain: 200 });
    element.dispatchEvent(new MouseEvent('pointerenter', { clientX: 0, clientY: 0 }));
    element.dispatchEvent(new Event('pointerleave'));
    element.dispatchEvent(new Event('pointerenter'));
    vi.advanceTimersByTime(2000);
    move(900, 0);
    expect(d.value).toBe(1);
  });

  it('stops requesting frames once settled', () => {
    dwell(element, { rise: 100, fall: 100 });
    element.dispatchEvent(new Event('pointerenter'));
    vi.advanceTimersByTime(500);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('hands listeners the last pointer position', () => {
    const d = dwell(element, { rise: 4000, fall: 600 });
    const listener = vi.fn();
    d.onChange(listener);
    element.dispatchEvent(new Event('pointerenter'));
    element.dispatchEvent(new MouseEvent('pointermove', { clientX: 12, clientY: 34 }));
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ x: 12, y: 34 }));
    vi.advanceTimersByTime(100);
    const last = listener.mock.lastCall?.[0];
    expect(last.value).toBeGreaterThan(0);
    expect([last.x, last.y]).toEqual([12, 34]);
  });

  it('stops notifying after unsubscribe', () => {
    const d = dwell(element, { rise: 4000, fall: 600 });
    const listener = vi.fn();
    d.onChange(listener)();
    element.dispatchEvent(new Event('pointerenter'));
    vi.advanceTimersByTime(100);
    expect(listener).not.toHaveBeenCalled();
  });

  it('ignores events after dispose', () => {
    const d = dwell(element, { rise: 4000, fall: 600 });
    const listener = vi.fn();
    d.onChange(listener);
    element.dispatchEvent(new Event('pointerenter'));
    vi.advanceTimersByTime(1000);
    d.dispose();
    const value = d.value;
    listener.mockClear();
    vi.advanceTimersByTime(1000);
    element.dispatchEvent(new MouseEvent('pointermove', { clientX: 5, clientY: 6 }));
    element.dispatchEvent(new Event('pointerleave'));
    vi.advanceTimersByTime(1000);
    expect(d.value).toBe(value);
    expect([d.x, d.y]).toEqual([0, 0]);
    expect(listener).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
