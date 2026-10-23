import { describe, expect, it } from 'vitest';
import { defaultPreferences, palettes, validatePreferences } from './appearance';

describe('appearance persistence input', () => {
  it('accepts all four themes in each appearance mode', () => {
    for (const palette of palettes)
      for (const appearance of ['system', 'light', 'dark']) {
        const p = { palette: palette.id, appearance, codeSize: 14 };
        expect(validatePreferences(p)).toEqual(p);
      }
  });
  it('accepts only known palettes, modes and bounded integer sizes', () => {
    expect(validatePreferences({ palette: 'graphite', appearance: 'dark', codeSize: 16 })).toEqual({
      palette: 'graphite',
      appearance: 'dark',
      codeSize: 14,
    });
    for (const value of [
      null,
      {},
      { palette: 'mist', appearance: 'dark', codeSize: 999 },
      { palette: 'mist', appearance: 'light', codeSize: 12.5 },
      { palette: 'unknown', appearance: 'system', codeSize: 12 },
    ]) {
      expect(validatePreferences(value)).toEqual(defaultPreferences);
    }
  });
});

it('migrates legacy sizes while preserving theme and appearance', () => {
  for (const codeSize of [11, 12, 13, 14, 15, 16]) {
    expect(validatePreferences({ palette: 'sand', appearance: 'dark', codeSize })).toEqual({
      palette: 'sand',
      appearance: 'dark',
      codeSize: codeSize <= 12 ? 12 : 14,
    });
  }
});
