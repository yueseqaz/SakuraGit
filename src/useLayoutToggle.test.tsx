// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useLayoutToggle } from './useLayoutToggle';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

it('remembers collapse state independently of the saved sidebar width', () => {
  localStorage.setItem('gitlane.layout.v1.sidebar', '0.25');
  const first = renderHook(() => useLayoutToggle('sidebar-collapsed'));
  expect(first.result.current[0]).toBe(false);
  act(() => first.result.current[1](true));
  expect(localStorage.getItem('gitlane.layout.v1.sidebar-collapsed')).toBe('true');
  expect(localStorage.getItem('gitlane.layout.v1.sidebar')).toBe('0.25');
  first.unmount();
  const second = renderHook(() => useLayoutToggle('sidebar-collapsed'));
  expect(second.result.current[0]).toBe(true);
  act(() => second.result.current[1]((value) => !value));
  expect(second.result.current[0]).toBe(false);
});

it('defaults to expanded for invalid storage and remains usable when persistence is blocked', () => {
  localStorage.setItem('gitlane.layout.v1.sidebar-collapsed', 'invalid');
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  const view = renderHook(() => useLayoutToggle('sidebar-collapsed'));
  expect(view.result.current[0]).toBe(false);
  act(() => view.result.current[1](true));
  expect(view.result.current[0]).toBe(true);
});
