// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { HistoryPanel } from './HistoryPanel';
import { demoSnapshot } from './demo';

afterEach(cleanup);
it('keeps the scroll position when automatic paging crosses the virtualization threshold', () => {
  const commits = Array.from({ length: 426 }, (_, i) => ({
    ...demoSnapshot.commits[0],
    hash: String(i).padStart(40, '0'),
    parents: [],
    subject: `Fixture ${i}`,
  }));
  const load = vi.fn();
  const props = {
    scope: 'fixture',
    loading: false,
    error: '',
    hasMore: true,
    onLoadMore: load,
    onReload: vi.fn(),
    onSelect: vi.fn(),
    search: '',
    selection: { kind: 'commit' as const, hash: commits[0].hash },
  };
  const view = render(<HistoryPanel {...props} commits={commits.slice(0, 300)} />);
  const list = view.container.querySelector('.commit-list')!;
  Object.defineProperties(list, {
    clientHeight: { value: 500, configurable: true },
    scrollHeight: { get: () => 300 * 84 },
  });
  list.scrollTop = 300 * 84 - 500;
  fireEvent.scroll(list);
  expect(load).toHaveBeenCalledTimes(1);
  view.rerender(<HistoryPanel {...props} commits={commits.slice(0, 400)} />);
  expect(list.scrollTop).toBe(300 * 84 - 500);
  expect(view.container.querySelectorAll('.commit-row').length).toBeLessThan(40);
  expect(list.textContent).toContain('Fixture 299');
  view.rerender(
    <HistoryPanel
      {...props}
      commits={commits}
      selection={{ kind: 'commit', hash: commits[425].hash }}
    />,
  );
  expect(list.scrollTop).toBe(425 * 84);
  expect(list.textContent).toContain('Fixture 425');
});

it('scrolls wide ancestry independently of commit text and reveals a selected off-screen node', () => {
  const parents = Array.from({ length: 20 }, (_, i) => `branch-${i}`);
  const commits = [
    { ...demoSnapshot.commits[0], hash: 'merge', parents },
    ...parents.map((hash, i) => ({ ...demoSnapshot.commits[0], hash, parents: [`older-${i}`] })),
    ...parents.map((_, i) => ({
      ...demoSnapshot.commits[0],
      hash: `older-${i}`,
      parents: ['root'],
    })),
    { ...demoSnapshot.commits[0], hash: 'root', parents: [] },
  ];
  const props = {
    scope: 'wide',
    commits,
    loading: false,
    error: '',
    hasMore: false,
    onLoadMore: vi.fn(),
    onReload: vi.fn(),
    onSelect: vi.fn(),
    search: '',
    selection: null,
  };
  const view = render(<HistoryPanel {...props} />);
  const scroll = view.getByRole('region', { name: '提交图谱水平滚动' });
  const graph = view.container.querySelector('svg.commit-graph')!;
  expect(graph.getAttribute('width')).toBe('382');
  expect(graph.getAttribute('viewBox')).toBe('0 0 382 66');
  expect(view.container.querySelectorAll('.commit-graph-viewport')).toHaveLength(commits.length);
  scroll.scrollLeft = 100;
  fireEvent.scroll(scroll);
  expect((graph as SVGElement).style.transform).toBe('translateX(-100px)');
  expect(view.container.querySelector<HTMLElement>('.commit-info')!.style.transform).toBe('');
  view.rerender(<HistoryPanel {...props} selection={{ kind: 'commit', hash: parents[19] }} />);
  expect(scroll.scrollLeft).toBeGreaterThan(300);
  view.rerender(<HistoryPanel {...props} scope="another-repo" />);
  expect(scroll.scrollLeft).toBe(0);
  expect((graph as SVGElement).style.transform).toBe('translateX(0px)');
});

it('adapts the graph column to panel resizing without leaving the offset out of range', () => {
  const observers: (() => void)[] = [];
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        observers.push(callback);
      }
      observe() {}
      disconnect() {}
    },
  );
  const parents = Array.from({ length: 10 }, (_, i) => `parent-${i}`);
  try {
    const view = render(
      <HistoryPanel
        scope="resize"
        commits={[{ ...demoSnapshot.commits[0], parents }]}
        loading={false}
        error=""
        hasMore={false}
        onLoadMore={vi.fn()}
        onReload={vi.fn()}
        onSelect={vi.fn()}
        selection={null}
        search=""
      />,
    );
    const list = view.container.querySelector('.commit-list')!;
    Object.defineProperty(list, 'clientWidth', { value: 400, configurable: true });
    act(() => observers.forEach((notify) => notify()));
    expect(
      view.container
        .querySelector<HTMLElement>('.history-panel')!
        .style.getPropertyValue('--history-graph-viewport'),
    ).toBe('144px');
    const scroll = view.getByRole('region', { name: '提交图谱水平滚动' });
    scroll.scrollLeft = 50;
    fireEvent.scroll(scroll);
    Object.defineProperty(list, 'clientWidth', { value: 1000, configurable: true });
    act(() => observers.forEach((notify) => notify()));
    expect(scroll.scrollLeft).toBe(0);
    expect(view.queryByRole('button', { name: '向右滚动图谱' })).toBeNull();
    view.rerender(
      <HistoryPanel
        scope="resize"
        commits={demoSnapshot.commits}
        loading={false}
        error=""
        hasMore={false}
        onLoadMore={vi.fn()}
        onReload={vi.fn()}
        onSelect={vi.fn()}
        selection={null}
        search="query"
      />,
    );
    expect(view.container.querySelector('.commit-graph-viewport')).toBeNull();
    expect(view.queryByRole('region', { name: '提交图谱水平滚动' })).toBeNull();
  } finally {
    vi.unstubAllGlobals();
  }
});
