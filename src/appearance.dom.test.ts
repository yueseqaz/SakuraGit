// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { applyPreferences, cachedPreferences } from './appearance';

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  document.documentElement.className = '';
});

it('switches Radix scales with the appearance while preserving unrelated classes', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  document.documentElement.classList.add('host-marker');
  applyPreferences({ palette: 'forest', appearance: 'system', codeSize: 14 });
  expect(document.documentElement.dataset.theme).toBe('dark');
  expect(document.documentElement.classList.contains('dark')).toBe(true);
  applyPreferences({ palette: 'sand', appearance: 'light', codeSize: 12 });
  expect(document.documentElement.classList.contains('dark')).toBe(false);
  expect(document.documentElement.classList.contains('light')).toBe(true);
  expect(document.documentElement.classList.contains('host-marker')).toBe(true);
  expect(document.documentElement.dataset.palette).toBe('sand');
  expect(document.documentElement.style.getPropertyValue('--code-size')).toBe('12px');
  expect(cachedPreferences()).toEqual({ palette: 'sand', appearance: 'light', codeSize: 12 });
});

it('does not introduce a fourth text size from an older cached preference', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  applyPreferences({ palette: 'mist', appearance: 'dark', codeSize: 13 });
  expect(document.documentElement.style.getPropertyValue('--code-size')).toBe('14px');
  expect(cachedPreferences().codeSize).toBe(14);
});
