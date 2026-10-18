import { describe, expect, it } from 'vitest';
import { buildGraph, isStaged, isUnstaged, parseDiff, splitDiff } from './git-view';
import type { Commit, File } from './mygo';

describe('unified diff', () => {
  it('bounds allocation when previewing a very large number of lines', () => {
    expect(parseDiff('@@ -0,0 +1,9999 @@\n' + '+new\n'.repeat(9999), 3001)).toHaveLength(3001);
  });
  it('does not mistake changed content for file headers', () => {
    const lines = parseDiff('@@ -1 +1 @@\n--- old\n+++ new\n');
    expect(lines[1]).toMatchObject({ kind: 'remove', old: 1 });
    expect(lines[2]).toMatchObject({ kind: 'add', next: 1 });
  });
  it('numbers additions and deletions independently', () => {
    const lines = parseDiff('--- a/a\n+++ b/a\n@@ -4,2 +4,3 @@\n same\n-old\n+new\n+extra\n');
    expect(lines[3]).toMatchObject({ kind: 'context', old: 4, next: 4 });
    expect(lines[4]).toMatchObject({ kind: 'remove', old: 5 });
    expect(lines[5]).toMatchObject({ kind: 'add', next: 5 });
    expect(lines[6]).toMatchObject({ kind: 'add', next: 6 });
  });
  it('resets line numbers at each hunk and each file', () => {
    const lines = parseDiff(
      '@@ -1 +1 @@\n-one\n+two\ndiff --git a/b b/b\n+++ b/b\n@@ -0,0 +1 @@\n+new',
    );
    expect(lines[4].kind).toBe('meta');
    expect(lines.at(-1)).toMatchObject({ kind: 'add', next: 1 });
  });
});

describe('side-by-side diff', () => {
  it('pairs replacements and preserves both original line numbers', () => {
    const rows = splitDiff(parseDiff('@@ -7,2 +7,3 @@\n-old\n+new\n+extra\n same'));
    expect(rows[1]).toMatchObject({
      kind: 'code',
      left: { old: 7, text: '-old' },
      right: { next: 7, text: '+new' },
    });
    expect(rows[2]).toMatchObject({
      kind: 'code',
      left: undefined,
      right: { next: 8, text: '+extra' },
    });
    expect(rows[3]).toMatchObject({ kind: 'code', left: { old: 8 }, right: { next: 9 } });
  });
  it('keeps unpaired deletions and additions on the correct side', () => {
    const rows = splitDiff(
      parseDiff('@@ -1 +0,0 @@\n-removed\ndiff --git a/new b/new\n@@ -0,0 +1 @@\n+added'),
    );
    expect(rows[1]).toMatchObject({ left: { text: '-removed' }, right: undefined });
    expect(rows.at(-1)).toMatchObject({ left: undefined, right: { text: '+added' } });
  });
  it('retains original hunk indices for safe block staging', () => {
    const rows = splitDiff(
      parseDiff(
        'diff --git a/a b/a\n--- a/a\n+++ b/a\n@@ -1 +1 @@\n-old\n+new\n@@ -20 +20 @@\n-old\n+new',
      ),
    );
    expect(rows.filter((row) => row.kind === 'hunk').map((row) => row.index)).toEqual([3, 6]);
  });
  it('does not lose missing-newline markers', () => {
    const rows = splitDiff(
      parseDiff(
        '@@ -1 +1 @@\n-old\n\\ No newline at end of file\n+new\n\\ No newline at end of file',
      ),
    );
    expect(rows.filter((row) => row.kind === 'meta')).toHaveLength(2);
    expect(rows.filter((row) => row.kind === 'code')).toHaveLength(2);
  });
});

describe('commit ancestry', () => {
  const commit = (hash: string, parents: string[]): Commit => ({
    hash,
    parents,
    short: hash,
    author: '',
    authorEmail: '',
    date: '',
    subject: '',
    refs: '',
  });
  it('creates actual merge lanes and collapses them at a shared ancestor', () => {
    const rows = buildGraph([
      commit('merge', ['left', 'right']),
      commit('left', ['root']),
      commit('right', ['root']),
      commit('root', []),
    ]);
    expect(rows[0].paths).toHaveLength(2);
    expect(rows[2].lane).toBe(1);
    expect(rows[3].lane).toBe(0);
    expect(rows[3].paths).toHaveLength(1);
  });
  it('handles multiple disconnected roots', () => {
    const rows = buildGraph([commit('one', []), commit('two', [])]);
    expect(rows.every((row) => row.paths.length === 0)).toBe(true);
  });
});

it('shows a partially staged file in both sections', () => {
  const file: File = {
    path: 'a',
    oldPath: '',
    index: 'M',
    worktree: 'M',
    untracked: false,
    conflicted: false,
  };
  expect(isStaged(file)).toBe(true);
  expect(isUnstaged(file)).toBe(true);
  expect(isStaged({ ...file, index: '.', worktree: '?', untracked: true })).toBe(false);
  expect(isStaged({ ...file, index: 'U', conflicted: true })).toBe(false);
});
