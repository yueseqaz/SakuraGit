import type { Preferences } from './mygo';

export const preferenceKey = 'gitlane.appearance.v1';
export const palettes = [
  { id: 'mist', name: '雾霾蓝', description: '安静、通透，让代码成为主角。' },
  { id: 'graphite', name: '石墨灰', description: '克制的中性色，专注每一行。' },
  { id: 'forest', name: '苔原绿', description: '低饱和的森林色，适合长时间工作。' },
  { id: 'sand', name: '暖砂纸', description: '温暖的纸张底色，让阅读更柔和。' },
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
