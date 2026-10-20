// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { DiffPanel } from './DiffPanel';
import { demoSnapshot } from './demo';
vi.mock('./useDiffHighlight', () => ({
  useDiffHighlight: () => ({ spans: new Map(), mode: 'plain' }),
}));
afterEach(() => {
  cleanup();
  localStorage.clear();
});
const diff = {
  path: 'hello.ts',
  text: 'diff --git a/hello.ts b/hello.ts\n--- a/hello.ts\n+++ b/hello.ts\n@@ -1 +1 @@\n-const a = 1;\n+const a = 2;\n',
  binary: false,
  revision: 'one',
  hunks: [{ id: 0, line: 3, header: '@@ -1 +1 @@' }],
};
const props = {
  diff,
  loading: false,
  error: '',
  selection: { kind: 'file' as const, path: diff.path, staged: false },
  snapshot: {
    ...demoSnapshot,
    files: [
      {
        path: diff.path,
        oldPath: '',
        index: '.',
        worktree: 'M',
        untracked: false,
        conflicted: false,
      },
    ],
  },
  onStage: vi.fn(),
  onHunk: vi.fn(),
  disabled: false,
  codeSize: 12,
  onCodeSize: vi.fn(),
};

it('sends only selected diff positions and clears stale selections', () => {
  const onLines = vi.fn();
  const view = render(<DiffPanel {...props} onLines={onLines} />);
  fireEvent.click(screen.getByLabelText('选择新第 1 行新增'));
  fireEvent.click(screen.getByText('暂存所选行'));
  expect(onLines).toHaveBeenCalledWith([5]);
  view.rerender(<DiffPanel {...props} diff={{ ...diff, revision: 'two' }} onLines={onLines} />);
  expect((screen.getByLabelText('选择新第 1 行新增') as HTMLInputElement).checked).toBe(false);
  expect((screen.getByText('暂存所选行') as HTMLButtonElement).disabled).toBe(true);
});

it('selects the same source positions in split mode and navigates hunks', () => {
  const onLines = vi.fn();
  render(<DiffPanel {...props} onLines={onLines} />);
  fireEvent.click(screen.getByText('并排'));
  fireEvent.click(screen.getByLabelText('选择原第 1 行删除'));
  fireEvent.click(screen.getByText('暂存所选行'));
  expect(onLines).toHaveBeenCalledWith([4]);
  fireEvent.click(screen.getByLabelText('下一个改动'));
  expect(document.querySelector('.diff-hunk.active-hunk')).not.toBeNull();
});
