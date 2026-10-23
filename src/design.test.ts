import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = new URL('.', import.meta.url);
const files = readdirSync(source);
describe('workbench design constraints', () => {
  it('uses Radix roles instead of literal component colors', () => {
    for (const name of files.filter((name) => name.endsWith('.css'))) {
      const css = readFileSync(new URL(name, source), 'utf8');
      expect(css, name).not.toMatch(/#[\da-f]{3,8}\b|\brgba?\(|\bhsla?\(/i);
      expect(css, name).not.toMatch(/(?:color|background)\s*:\s*(?:white|black)\b/);
    }
  });
  it('uses three readable sizes and hairline component borders', () => {
    for (const name of files.filter((name) => name.endsWith('.css'))) {
      const css = readFileSync(new URL(name, source), 'utf8');
      for (const declaration of css.matchAll(/\bfont(?:-size)?\s*:[^;{}]+;/g)) {
        for (const size of declaration[0].matchAll(/([\d.]+)px/g)) {
          // Zero-size labels are intentionally replaced by accessible icon names.
          expect([0, 12, 14, 18], `${name}: ${declaration[0]}`).toContain(Number(size[1]));
        }
      }
      for (const border of css.matchAll(
        /\bborder(?:-(?:top|right|bottom|left|block(?:-start|-end)?|inline(?:-start|-end)?))?(?:-width)?\s*:\s*([\d.]+)px/g,
      )) {
        expect(Number(border[1]), `${name}: ${border[0]}`).toBe(0.5);
      }
      expect(css, name).not.toMatch(/box-shadow\s*:(?!\s*none\b)[^;]+;/);
    }
  });
  it('does not use middle-dot separators in product copy', () => {
    for (const name of files.filter((name) => name.endsWith('.tsx') && !name.includes('.test.'))) {
      expect(readFileSync(new URL(name, source), 'utf8'), name).not.toContain('·');
    }
  });
});
