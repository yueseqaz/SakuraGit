// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import {
  cacheSession,
  emptySession,
  newerSession,
  readSessionCache,
  restoreStartup,
} from './session';
beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});
it('restores page, selection and isolated repository drafts from cache', () => {
  const s = {
    ...emptySession(),
    root: '/project/a',
    view: 'history',
    kind: 'commit',
    hash: 'abcdef',
    search: 'author',
    updatedAt: 123,
    drafts: {
      '/project/a': { title: 'A', body: 'one' },
      '/project/b': { title: 'B', body: 'two' },
    },
  };
  expect(cacheSession(s)).toBe(true);
  expect(readSessionCache()).toEqual(s);
  expect(newerSession({ ...s, updatedAt: 122 }, readSessionCache())).toEqual(s);
  expect(newerSession({ ...s, updatedAt: 124 }, readSessionCache()).updatedAt).toBe(124);
});
it('recovers malformed, relative and malicious cache data', () => {
  const name = ['gitlane', 'workspace', 'v1'].join('.');
  for (const v of [
    '{',
    JSON.stringify({ ...emptySession(), updatedAt: -1 }),
    JSON.stringify({ ...emptySession(), root: 'relative' }),
    JSON.stringify({ ...emptySession(), drafts: [] }),
  ]) {
    localStorage.setItem(name, v);
    expect(readSessionCache()).toEqual(emptySession());
  }
  localStorage.setItem(
    name,
    JSON.stringify({
      ...emptySession(),
      drafts: { '../bad': { title: 'bad', body: '' } },
      path: 'a\0b',
      hash: 'not a hash',
    }),
  );
  expect(readSessionCache().drafts).toEqual({});
  expect(readSessionCache().path).toBe('');
  expect(readSessionCache().hash).toBe('');
});
it('reports unavailable storage without throwing', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('quota');
  });
  expect(cacheSession(emptySession())).toBe(false);
});

it('honors explicit startup paths and isolates ephemeral smoke from saved workspaces', () => {
  const native = { ...emptySession(), root: '/old', updatedAt: 1 };
  const cached = { ...native, root: '/new', updatedAt: 2 };
  const startup = {
    path: '/old',
    session: native,
    explicitPath: false,
    ephemeral: false,
    recents: [],
  };
  expect(restoreStartup(startup, cached).path).toBe('/new');
  expect(restoreStartup({ ...startup, path: '/explicit', explicitPath: true }, cached).path).toBe(
    '/explicit',
  );
  const isolated = restoreStartup({ ...startup, path: '/fixture', ephemeral: true }, cached);
  expect(isolated.path).toBe('/fixture');
  expect(isolated.saved).toEqual(emptySession());
});
