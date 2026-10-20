// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ConflictPanel } from './ConflictPanel';
import { Workbench } from './workbench-api';
vi.mock('mygo-runtime', () => ({ isMyGo: () => true }));
vi.mock('./workbench-api', () => ({ Workbench: { conflict: vi.fn(), saveConflict: vi.fn() } }));
const details = {
  path: 'file.txt',
  revision: 'original',
  state: 'merge',
  base: 'base\n',
  ours: 'ours\n',
  theirs: 'theirs\n',
  result: 'auto\n<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> feature\nend\n',
};
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  localStorage.clear();
});

it('keeps automatic merges, confirms save and sends the exact source revision', async () => {
  vi.mocked(Workbench.conflict).mockResolvedValue(details);
  const run = vi.fn(async (_label, fn) => {
    await fn('/fixture');
    return true;
  });
  await act(async () => {
    render(<ConflictPanel root="/fixture" path="file.txt" busy={false} run={run} />);
  });
  expect((screen.getByText('保存并暂存') as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByText('依次保留双方'));
  expect((screen.getByLabelText('合并结果代码') as HTMLTextAreaElement).value).toBe(
    'auto\nours\ntheirs\nend\n',
  );
  fireEvent.click(screen.getByText('保存并暂存'));
  expect(run).not.toHaveBeenCalled();
  await act(async () => {
    fireEvent.click(screen.getByText('确认保存并暂存'));
  });
  expect(Workbench.saveConflict).toHaveBeenCalledWith(
    '/fixture',
    'file.txt',
    'original',
    'auto\nours\ntheirs\nend\n',
  );
});

it('restores drafts without silently rebasing them onto external edits', async () => {
  const key = `gitlane.merge-draft.v1.${JSON.stringify(['/fixture', 'file.txt'])}`;
  localStorage.setItem(
    key,
    JSON.stringify({ revision: 'old-version', result: 'unfinished draft' }),
  );
  vi.mocked(Workbench.conflict).mockResolvedValue(details);
  await act(async () => {
    render(<ConflictPanel root="/fixture" path="file.txt" busy={false} run={vi.fn()} />);
  });
  expect((screen.getByLabelText('合并结果代码') as HTMLTextAreaElement).value).toBe(
    'unfinished draft',
  );
  expect((screen.getByText('保存并暂存') as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByText('重新读取'));
  expect((screen.getByLabelText('合并结果代码') as HTMLTextAreaElement).value).toBe(
    'unfinished draft',
  );
  await act(async () => {
    fireEvent.click(screen.getByText('确认重新读取'));
  });
  expect((screen.getByLabelText('合并结果代码') as HTMLTextAreaElement).value).toBe(details.result);
});

it('caches edits immediately so navigating away does not discard a merge draft', async () => {
  vi.mocked(Workbench.conflict).mockResolvedValue(details);
  const props = { root: '/fixture', path: 'file.txt', busy: false, run: vi.fn() };
  let view!: ReturnType<typeof render>;
  await act(async () => {
    view = render(<ConflictPanel {...props} />);
  });
  fireEvent.change(screen.getByLabelText('合并结果代码'), {
    target: { value: 'edited manually\n' },
  });
  view.unmount();
  await act(async () => {
    render(<ConflictPanel {...props} />);
  });
  expect((screen.getByLabelText('合并结果代码') as HTMLTextAreaElement).value).toBe(
    'edited manually\n',
  );
});
