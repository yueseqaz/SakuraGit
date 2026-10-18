import { describe, expect, it } from 'vitest';
import { changedRanges, highlightDiff, languageFor } from './diff-highlight';
import { parseDiff } from './git-view';

describe('diff highlighting', () => {
  it('detects selected local grammars and falls back for unknown files', () => {
    expect(languageFor('src/Menu.tsx')).toBe('tsx');
    expect(languageFor('main.go')).toBe('go');
    expect(languageFor('README.md')).toBe('markdown');
    expect(languageFor('unknown.xyz')).toBe('');
  });
  it('preserves exact source text including markup, whitespace and unicode', () => {
    const lines = parseDiff(
      '@@ -1 +1 @@\n-const label = "旧的";\n+const label = "<script>&新的";\n',
    );
    const result = highlightDiff(lines, 'main.ts');
    for (const line of lines.slice(1))
      expect(
        result
          .get(line)
          ?.map((s) => s.text)
          .join(''),
      ).toBe(line.text.slice(1));
    expect(result.get(lines[2])?.some((s) => s.type === 'keyword')).toBe(true);
    expect(result.get(lines[2])?.some((s) => s.changed)).toBe(true);
    expect(lines[0].text).toBe('@@ -1 +1 @@');
  });
  it('keeps multiline comment state within each before/after hunk', () => {
    const lines = parseDiff(
      '@@ -1,3 +1,3 @@\n /* comment\n-old text\n+new text\n  */\n@@ -20 +20 @@\n+const value = 2;',
    );
    const result = highlightDiff(lines, 'main.ts');
    expect(result.get(lines[3])?.every((s) => s.type === 'comment')).toBe(true);
    expect(result.get(lines[6])?.some((s) => s.type === 'keyword')).toBe(true);
  });
  it('uses patch file headers for multi-file stash diffs', () => {
    const lines = parseDiff(
      'diff --git a/a.go b/a.go\n--- a/a.go\n+++ b/a.go\n@@ -0,0 +1 @@\n+package main\ndiff --git a/b.json b/b.json\n--- a/b.json\n+++ b/b.json\n@@ -0,0 +1 @@\n+{"enabled": true}',
    );
    const result = highlightDiff(lines, 'stash-id');
    expect(result.get(lines[4])?.some((s) => s.type === 'keyword')).toBe(true);
    expect(result.get(lines[9])?.some((s) => s.type === 'boolean')).toBe(true);
  });
  it('limits expensive work for minified lines while preserving plain text', () => {
    const content = 'x'.repeat(10000);
    const lines = parseDiff(`@@ -1 +1 @@\n-${content}\n+${content}a`);
    const result = highlightDiff(lines, 'large.ts');
    expect(result.get(lines[2])).toEqual([{ text: `${content}a`, type: '', changed: false }]);
    expect(changedRanges(content, content + 'a')).toEqual([[], []]);
  });
  it('highlights only changed words in paired lines', () => {
    const [old, next] = changedRanges('const color = "red";', 'const color = "blue";');
    expect(old.map((r) => 'const color = "red";'.slice(r.start, r.end)).join('')).toBe('red');
    expect(next.map((r) => 'const color = "blue";'.slice(r.start, r.end)).join('')).toBe('blue');
  });
});
