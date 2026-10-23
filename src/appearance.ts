import type { Preferences } from './mygo';

export const preferenceKey = 'gitlane.appearance.v1';
export const palettes = [
  { id: 'mist', name: '雾霾蓝' },
  { id: 'graphite', name: '石墨灰' },
  { id: 'forest', name: '苔原绿' },
  { id: 'sand', name: '暖砂纸' },
] as const;
export const defaultPreferences: Preferences = {
  palette: 'mist',
  appearance: 'system',
  codeSize: 12,
};
export function validatePreferences(value: unknown): Preferences {
  const p = value as Partial<Preferences> | null;
  return p &&
    palettes.some((palette) => palette.id === p.palette) &&
    ['system', 'light', 'dark'].includes(p.appearance || '') &&
    Number.isInteger(p.codeSize) &&
    p.codeSize! >= 11 &&
    p.codeSize! <= 16
    ? { ...(p as Preferences), codeSize: p.codeSize! <= 12 ? 12 : 14 }
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
  root.classList.toggle('dark', root.dataset.theme === 'dark');
  root.classList.toggle('light', root.dataset.theme === 'light');
  root.style.setProperty('--code-size', `${p.codeSize <= 12 ? 12 : 14}px`);
  try {
    localStorage.setItem(preferenceKey, JSON.stringify(p));
  } catch {
    /* Native storage remains authoritative. */
  }
}
