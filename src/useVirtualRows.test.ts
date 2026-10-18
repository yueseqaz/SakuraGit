import { expect, it } from 'vitest';
import { virtualRange } from './useVirtualRows';
it('bounds rendered rows in a 10000-row list', () => {
  const r = virtualRange(10000, 84, 84000, 600);
  expect(r.start).toBe(992);
  expect(r.end - r.start).toBeLessThan(30);
  expect(r.before + (r.end - r.start) * 84 + r.after).toBe(840000);
});
it('clamps stale scroll positions after counts shrink and handles empty lists', () => {
  expect(virtualRange(0, 56, 9000, 600)).toEqual({ start: 0, end: 0, before: 0, after: 0 });
  const r = virtualRange(10, 56, 100000, 600);
  expect(r.start).toBeLessThan(10);
  expect(r.end).toBe(10);
  expect(r.after).toBe(0);
  expect(virtualRange(4, 56, 0, 600, false)).toEqual({ start: 0, end: 4, before: 0, after: 0 });
});
