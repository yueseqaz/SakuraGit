// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { cacheEditorDrafts, readEditorDrafts, documentID } from './editor-state';
afterEach(() => localStorage.clear());
const draft = {
  root: '/repo',
  path: 'file.ts',
  original: 'before',
  content: 'after',
  revision: 'a'.repeat(64),
};
it('persists only dirty drafts and keeps roots separate', () => {
  expect(cacheEditorDrafts([draft, { ...draft, path: 'clean', content: draft.original }])).toBe(
    true,
  );
  expect(readEditorDrafts()).toEqual([draft]);
  expect(documentID('/other', draft.path)).not.toBe(documentID(draft.root, draft.path));
});
it('rejects malformed, duplicate and oversized cached drafts', () => {
  localStorage.setItem(
    ['gitlane', 'editor-drafts', 'v1'].join('.'),
    JSON.stringify([draft, draft, { ...draft, path: 'bad', revision: '' }]),
  );
  expect(readEditorDrafts()).toEqual([draft]);
  localStorage.setItem(['gitlane', 'editor-drafts', 'v1'].join('.'), '{');
  expect(readEditorDrafts()).toEqual([]);
});
