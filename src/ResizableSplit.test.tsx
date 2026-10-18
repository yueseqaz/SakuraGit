// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ResizableSplit, readSplit, splitBounds } from './ResizableSplit';
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('PointerEvent', MouseEvent);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const panel = () => (
  <ResizableSplit
    name="test"
    label="Resize panes"
    className="test-split"
    initial={0.4}
    minFirst={200}
    minSecond={300}
  >
    <div>A</div>
    <div>B</div>
  </ResizableSplit>
);
function geometry(element: Element) {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: 1000,
    height: 600,
    right: 1000,
    bottom: 600,
    x: 0,
    y: 0,
    toJSON() {},
  });
}
it('clamps sizes and recovers malformed or unavailable stored layouts', () => {
  expect(splitBounds(1000, 200, 300)).toEqual({ min: 0.2, max: 0.7 });
  expect(splitBounds(250, 200, 300)).toEqual({ min: 0.4, max: 0.4 });
  localStorage.setItem('gitlane.layout.v1.test', 'Infinity');
  expect(readSplit('test', 0.4)).toBe(0.4);
  localStorage.setItem('gitlane.layout.v1.test', '0.6');
  expect(readSplit('test', 0.4)).toBe(0.6);
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  expect(readSplit('test', 0.4)).toBe(0.4);
});
it('drags with window pointer capture, saves on release, restores on remount, and resets on double click', () => {
  const view = render(panel());
  const handle = screen.getByRole('separator');
  geometry(handle.parentElement!);
  fireEvent.pointerDown(handle, { button: 0, clientX: 400 });
  fireEvent.pointerMove(window, { clientX: 950 });
  fireEvent.pointerUp(window, { clientX: 950 });
  expect(handle.getAttribute('aria-valuenow')).toBe('70');
  expect(localStorage.getItem('gitlane.layout.v1.test')).toBe('0.7');
  expect(document.documentElement.classList.contains('resizing-columns')).toBe(false);
  view.unmount();
  render(panel());
  expect(screen.getByRole('separator').getAttribute('aria-valuenow')).toBe('70');
  fireEvent.doubleClick(screen.getByRole('separator'));
  expect(localStorage.getItem('gitlane.layout.v1.test')).toBe('0.4');
});
it('supports keyboard resizing, cancels interrupted drags, and cleans up global listeners on unmount', () => {
  const view = render(panel());
  const handle = screen.getByRole('separator');
  geometry(handle.parentElement!);
  fireEvent.keyDown(handle, { key: 'ArrowRight' });
  expect(Number(handle.getAttribute('aria-valuenow'))).toBeGreaterThan(40);
  const saved = localStorage.getItem('gitlane.layout.v1.test');
  fireEvent.pointerDown(handle, { button: 0 });
  fireEvent.pointerMove(window, { clientX: 600 });
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(localStorage.getItem('gitlane.layout.v1.test')).toBe(saved);
  expect(document.documentElement.classList.contains('resizing-columns')).toBe(false);
  fireEvent.pointerDown(handle, { button: 0 });
  view.unmount();
  fireEvent.pointerUp(window, { clientX: 900 });
  expect(localStorage.getItem('gitlane.layout.v1.test')).toBe(saved);
  expect(document.documentElement.classList.contains('resizing-columns')).toBe(false);
});
it('resizes vertically and ignores dragging in the stacked narrow layout', () => {
  render(
    <ResizableSplit
      name="vertical"
      label="Height"
      axis="vertical"
      className="test-split"
      initial={0.5}
      minFirst={120}
      minSecond={180}
    >
      <div>A</div>
      <div>B</div>
    </ResizableSplit>,
  );
  const handle = screen.getByRole('separator');
  geometry(handle.parentElement!);
  fireEvent.pointerDown(handle, { button: 0 });
  fireEvent.pointerMove(window, { clientY: 900 });
  fireEvent.pointerUp(window, { clientY: 900 });
  expect(localStorage.getItem('gitlane.layout.v1.vertical')).toBe('0.7');
  expect(handle.getAttribute('aria-orientation')).toBe('horizontal');
  fireEvent.keyDown(handle, { key: 'ArrowUp' });
  const saved = localStorage.getItem('gitlane.layout.v1.vertical');
  expect(Number(saved)).toBeLessThan(0.7);
  vi.stubGlobal('innerWidth', 390);
  fireEvent.pointerDown(handle, { button: 0 });
  fireEvent.pointerUp(window, { clientY: 200 });
  expect(localStorage.getItem('gitlane.layout.v1.vertical')).toBe(saved);
});
