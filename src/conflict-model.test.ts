import { expect, it } from 'vitest';
import { conflictBlocks, hasConflictMarkers, resolveBlock } from './conflict-model';

it('resolves a diff3 block without losing automatic merges or CRLF', () => {
  const text =
    'auto merged\r\n<<<<<<< HEAD\r\nours\r\n||||||| base\r\nbase\r\n=======\r\ntheirs\r\n>>>>>>> feature\r\nend\r\n';
  const blocks = conflictBlocks(text);
  expect(blocks).toHaveLength(1);
  expect(blocks[0].ours).toBe('ours\r\n');
  expect(blocks[0].theirs).toBe('theirs\r\n');
  expect(resolveBlock(text, blocks[0], 'both')).toBe('auto merged\r\nours\r\ntheirs\r\nend\r\n');
  expect(hasConflictMarkers(resolveBlock(text, blocks[0], 'ours'))).toBe(false);
});

it('finds subsequent blocks after one has been resolved', () => {
  const block = '<<<<<<< HEAD\na\n=======\nb\n>>>>>>> feature\n';
  const text = block + 'middle\n' + block;
  const resolved = resolveBlock(text, conflictBlocks(text)[0], 'theirs');
  expect(conflictBlocks(resolved)).toHaveLength(1);
  expect(resolved.startsWith('b\nmiddle\n')).toBe(true);
});

it('does not offer an incomplete block and detects orphaned markers', () => {
  expect(conflictBlocks('<<<<<<< HEAD\na\n=======\nb\n')).toEqual([]);
  expect(hasConflictMarkers('orphan\n>>>>>>> feature\n')).toBe(true);
  expect(hasConflictMarkers('plain <html>\n')).toBe(false);
});
