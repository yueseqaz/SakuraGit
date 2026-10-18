// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
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
