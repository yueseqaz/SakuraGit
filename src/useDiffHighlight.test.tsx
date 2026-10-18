// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useDiffHighlight } from './useDiffHighlight';
import { parseDiff } from './git-view';
vi.mock('./diff-worker?worker&inline', () => ({
  default: class {
    constructor() {
      return new Worker('test-worker');
    }
  },
}));
const workers: FakeWorker[] = [];
class FakeWorker {
  onmessage: ((e: { data: { spans: unknown[] } }) => void) | null = null;
  onerror: (() => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() {
    workers.push(this);
  }
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  workers.length = 0;
});
it('discards late worker highlights after file selection changes and terminates workers', () => {
  vi.stubGlobal('Worker', FakeWorker);
  const a = parseDiff('@@ -1 +1 @@\n-old\n+new\n');
  const b = parseDiff('@@ -1 +1 @@\n-before\n+after\n');
  const { result, rerender, unmount } = renderHook(
    ({ lines, path }) => useDiffHighlight(lines, path),
    { initialProps: { lines: a, path: 'a.ts' } },
  );
  rerender({ lines: b, path: 'b.ts' });
  expect(workers[0].terminate).toHaveBeenCalled();
  act(() =>
    workers[0].onmessage?.({ data: { spans: a.map(() => [{ text: 'stale', token: 'keyword' }]) } }),
  );
  expect(result.current.spans.size).toBe(0);
  act(() =>
    workers[1].onmessage?.({ data: { spans: b.map(() => [{ text: 'fresh', token: 'keyword' }]) } }),
  );
  expect(result.current.spans.get(b[0])?.[0].text).toBe('fresh');
  unmount();
  expect(workers[1].terminate).toHaveBeenCalled();
});
it('falls back to plain text without workers and bounds worker execution', () => {
  const lines = parseDiff('@@ -1 +1 @@\n-x\n+y\n');
  vi.stubGlobal('Worker', undefined);
  const plain = renderHook(() => useDiffHighlight(lines, 'a.ts'));
  expect(plain.result.current.spans.size).toBe(0);
  plain.unmount();
  vi.useFakeTimers();
  vi.stubGlobal('Worker', FakeWorker);
  const pending = renderHook(() => useDiffHighlight(lines, 'a.ts'));
  act(() => vi.advanceTimersByTime(5000));
  expect(workers[0].terminate).toHaveBeenCalled();
  expect(pending.result.current.spans.size).toBe(0);
});

it('falls back for small WebView diffs but leaves large diffs plain when workers fail', async () => {
  vi.stubGlobal('Worker', undefined);
  const lines = parseDiff('@@ -1 +1 @@\n-export const n = 1;\n+export const n = 2;\n');
  const small = renderHook(() => useDiffHighlight(lines, 'code.ts'));
  await waitFor(() => expect(small.result.current.mode).toBe('fallback'));
  expect(
    [...small.result.current.spans.values()].flat().some((span) => span.type === 'keyword'),
  ).toBe(true);
  small.unmount();
  const large = renderHook(() =>
    useDiffHighlight(
      Array.from({ length: 401 }, () => lines[1]),
      'code.ts',
    ),
  );
  await act(async () => {
    await Promise.resolve();
  });
  expect(large.result.current.mode).toBe('plain');
  expect(large.result.current.spans.size).toBe(0);
});
it('invalidates highlights when the same source is interpreted as a different language', () => {
  vi.stubGlobal('Worker', FakeWorker);
  const lines = parseDiff('@@ -1 +1 @@\n-old\n+new\n');
  const { result, rerender } = renderHook(({ path }) => useDiffHighlight(lines, path), {
    initialProps: { path: 'code.ts' },
  });
  act(() =>
    workers[0].onmessage?.({
      data: { spans: lines.map(() => [{ text: 'fresh', type: 'keyword', changed: false }]) },
    }),
  );
  expect(result.current.mode).toBe('worker');
  rerender({ path: 'code.py' });
  expect(result.current.mode).toBe('plain');
  expect(result.current.spans.size).toBe(0);
});
