// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useHistory } from './useHistory';
import { Git, type HistoryPage } from './mygo';
import { demoSnapshot } from './demo';

vi.mock('./mygo', () => ({ Git: { history: vi.fn() } }));
const page = (subject: string, hasMore = false): HistoryPage => ({
  commits: [{ ...demoSnapshot.commits[0], hash: subject, subject }],
  hasMore,
  nextOffset: 101,
  revision: 'r1',
});
const snapshot = { ...demoSnapshot, historyRevision: 'r1', historyHasMore: true };
beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(Git.history).mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it('appends pages and preserves older commits through worktree-only refreshes', async () => {
  vi.mocked(Git.history).mockResolvedValue(page('older'));
  const { result, rerender } = renderHook(({ repo }) => useHistory(repo, '', true), {
    initialProps: { repo: snapshot },
  });
  await act(async () => {
    await result.current.loadMore();
  });
  expect(Git.history).toHaveBeenCalledWith(snapshot.root, '', 'r1', snapshot.commits.length);
  expect(result.current.commits.at(-1)?.subject).toBe('older');
  rerender({ repo: { ...snapshot, files: [] } });
  expect(result.current.commits.at(-1)?.subject).toBe('older');
  expect(result.current.hasMore).toBe(false);
});

it('debounces repository-wide searches and ignores an older search response', async () => {
  let finishOld!: (value: HistoryPage) => void;
  vi.mocked(Git.history)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOld = resolve;
        }),
    )
    .mockResolvedValueOnce(page('new result'));
  const { result, rerender } = renderHook(({ query }) => useHistory(snapshot, query, true), {
    initialProps: { query: 'old' },
  });
  expect(result.current.loading).toBe(true);
  expect(result.current.commits).toEqual([]);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
  rerender({ query: 'new' });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
  expect(result.current.commits[0].subject).toBe('new result');
  await act(async () => {
    finishOld(page('stale result'));
  });
  expect(result.current.commits[0].subject).toBe('new result');
});

it('rejects late pagination from another repository and resets when refs change', async () => {
  let finish!: (value: HistoryPage) => void;
  vi.mocked(Git.history).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { result, rerender } = renderHook(({ repo }) => useHistory(repo, '', true), {
    initialProps: { repo: snapshot },
  });
  let pending!: Promise<void>;
  act(() => {
    pending = result.current.loadMore();
  });
  rerender({ repo: { ...snapshot, root: '/another/repo', historyRevision: 'r2', commits: [] } });
  await act(async () => {
    finish(page('wrong repo'));
    await pending;
  });
  expect(result.current.commits).toEqual([]);
  expect(result.current.loading).toBe(false);
});

it('reports query errors without claiming no results, and can retry from the start', async () => {
  vi.mocked(Git.history)
    .mockRejectedValueOnce(new Error('history changed'))
    .mockResolvedValueOnce(page('recovered'));
  const { result } = renderHook(() => useHistory(snapshot, 'older', true));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
  expect(result.current.error).toContain('history changed');
  await act(async () => {
    await result.current.reload();
  });
  expect(Git.history).toHaveBeenLastCalledWith(snapshot.root, 'older', '', 0);
  expect(result.current.commits[0].subject).toBe('recovered');
  expect(result.current.error).toBe('');
});
