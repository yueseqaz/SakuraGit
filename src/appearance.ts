import type { Preferences } from './mygo';

export const preferenceKey = 'gitlane.appearance.v1';
export const defaultPreferences: Preferences = {
  palette: 'mist',
  appearance: 'system',
  codeSize: 12,
};
export function validatePreferences(value: unknown): Preferences {
  const p = value as Partial<Preferences> | null;
  return p &&
    ['mist', 'graphite'].includes(p.palette || '') &&
    ['system', 'light', 'dark'].includes(p.appearance || '') &&
    Number.isInteger(p.codeSize) &&
    p.codeSize! >= 11 &&
    p.codeSize! <= 16
    ? (p as Preferences)
    : { ...defaultPreferences };
}
export function cachedPreferences(): Preferences {
  try {
    return validatePreferences(JSON.parse(localStorage.getItem(preferenceKey) || 'null'));
  } catch {
    return { ...defaultPreferences };
  }
}
export function applyPreferences(p: Preferences) {
  const root = document.documentElement;
  root.dataset.palette = p.palette;
  root.dataset.appearance = p.appearance;
  root.dataset.theme =
    p.appearance === 'system'
      ? matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : p.appearance;
  root.style.setProperty('--code-size', `${p.codeSize}px`);
  try {
    localStorage.setItem(preferenceKey, JSON.stringify(p));
  } catch {
    /* Native storage remains authoritative. */
  }
}
