// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useRef } from 'react';
import { useAutoLoadMore } from './useAutoLoadMore';
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
const load = vi.fn();
function List({
  count = 100,
  loading = false,
  error = '',
  scope = 'repo',
  hasMore = true,
}: {
  count?: number;
  loading?: boolean;
  error?: string;
  scope?: string;
  hasMore?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useAutoLoadMore(ref, { key: scope, count, loading, error, hasMore, loadMore: load });
  return <div ref={ref} data-testid="list" />;
}
function metrics(element: HTMLElement) {
  const m = { top: 0, total: 8400, height: 400 };
  Object.defineProperties(element, {
    clientHeight: { get: () => m.height },
    scrollHeight: { get: () => m.total },
    scrollTop: {
      get: () => m.top,
      set: (v) => {
        m.top = v;
      },
    },
  });
  return m;
}
it('loads near the bottom, deduplicates repeated events, and continues only after scrolling the next page', () => {
  vi.useFakeTimers();
  load.mockClear();
  const view = render(<List />);
  const list = screen.getByTestId('list');
  const m = metrics(list);
  fireEvent.scroll(list);
  expect(load).not.toHaveBeenCalled();
  m.top = 7800;
  fireEvent.scroll(list);
  fireEvent.scroll(list);
  expect(load).toHaveBeenCalledTimes(1);
  view.rerender(<List loading />);
  fireEvent.scroll(list);
  expect(load).toHaveBeenCalledTimes(1);
  m.total = 16800;
  view.rerender(<List count={200} />);
  act(() => vi.runOnlyPendingTimers());
  expect(load).toHaveBeenCalledTimes(1);
  m.top = 16100;
  fireEvent.scroll(list);
  expect(load).toHaveBeenCalledTimes(1);
  m.top = 16200;
  fireEvent.scroll(list);
  expect(load).toHaveBeenCalledTimes(2);
});
it('stops at errors/end, permits explicit retry, and resets guards for another repository or query', () => {
  vi.useFakeTimers();
  load.mockClear();
  const view = render(<List error="network failed" />);
  const list = screen.getByTestId('list');
  const m = metrics(list);
  m.top = 8000;
  fireEvent.scroll(list);
  expect(load).not.toHaveBeenCalled();
  view.rerender(<List />);
  act(() => vi.runOnlyPendingTimers());
  expect(load).toHaveBeenCalledTimes(1);
  view.rerender(<List error="again" />);
  fireEvent.scroll(list);
  expect(load).toHaveBeenCalledTimes(1);
  view.rerender(<List />);
  act(() => vi.runOnlyPendingTimers());
  expect(load).toHaveBeenCalledTimes(2);
  view.rerender(<List hasMore={false} />);
  fireEvent.scroll(list);
  expect(load).toHaveBeenCalledTimes(2);
  view.rerender(<List scope="other repo/search" />);
  act(() => vi.runOnlyPendingTimers());
  expect(load).toHaveBeenCalledTimes(3);
  view.rerender(<List />);
  act(() => vi.runOnlyPendingTimers());
  expect(load).toHaveBeenCalledTimes(4);
  view.unmount();
  fireEvent.scroll(list);
  expect(load).toHaveBeenCalledTimes(4);
});
it('fills an underfilled viewport but never loops on zero-progress pages or hidden containers', () => {
  vi.useFakeTimers();
  load.mockClear();
  const view = render(<List />);
  const list = screen.getByTestId('list');
  const m = metrics(list);
  m.total = 100;
  m.height = 0;
  act(() => vi.runOnlyPendingTimers());
  expect(load).not.toHaveBeenCalled();
  m.height = 400;
  fireEvent(window, new Event('resize'));
  expect(load).toHaveBeenCalledTimes(1);
  view.rerender(<List loading />);
  view.rerender(<List />);
  act(() => vi.runOnlyPendingTimers());
  expect(load).toHaveBeenCalledTimes(1);
});
