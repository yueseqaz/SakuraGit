// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { NewRepositoryDialog } from './NewRepositoryDialog';
import { Git, type RemoteBranches } from './mygo';

vi.mock('mygo-runtime', () => ({ isMyGo: () => true }));
vi.mock('./mygo', () => ({
  Git: { remoteBranches: vi.fn(), cloneProgress: vi.fn(), cancelClone: vi.fn() },
}));
afterEach(() => {
  cleanup();
  vi.mocked(Git.remoteBranches).mockReset();
  vi.mocked(Git.cloneProgress).mockReset();
  vi.mocked(Git.cancelClone).mockReset();
});

it('discovers branches, distinguishes checkout from single-branch, and submits both', async () => {
  const create = vi.fn().mockResolvedValue(undefined);
  vi.mocked(Git.remoteBranches).mockResolvedValue({
    branches: ['main', 'feature/blue'],
    defaultBranch: 'main',
  });
  render(<NewRepositoryDialog busy={false} onClose={() => {}} onCreate={create} />);
  fireEvent.change(screen.getByLabelText('仓库地址'), { target: { value: '/remote/repo' } });
  await act(async () => {
    fireEvent.click(screen.getByText('读取远程分支'));
  });
  expect((screen.getByLabelText('检出分支') as HTMLSelectElement).value).toBe('main');
  fireEvent.change(screen.getByLabelText('检出分支'), { target: { value: 'feature/blue' } });
  fireEvent.click(screen.getByLabelText('只拉取所选分支（不跟踪其他远程分支）'));
  fireEvent.change(screen.getByLabelText('保存到父文件夹'), { target: { value: '/tmp' } });
  fireEvent.change(screen.getByLabelText('新文件夹名称'), { target: { value: 'clone' } });
  await act(async () => {
    fireEvent.click(screen.getByText('克隆并打开'));
  });
  expect(create).toHaveBeenCalledWith(
    '/remote/repo',
    '/tmp/clone',
    false,
    false,
    'feature/blue',
    true,
    expect.any(String),
  );
});

it('invalidates discovered branches immediately when the URL changes', async () => {
  let finish!: (value: RemoteBranches) => void;
  vi.mocked(Git.remoteBranches).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(<NewRepositoryDialog busy={false} onClose={() => {}} onCreate={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('仓库地址'), { target: { value: '/old/repo' } });
  fireEvent.click(screen.getByText('读取远程分支'));
  fireEvent.change(screen.getByLabelText('仓库地址'), { target: { value: '/new/repo' } });
  await act(async () => {
    finish({ branches: ['old-branch'], defaultBranch: 'old-branch' });
  });
  expect(screen.queryByText('old-branch · 默认')).toBeNull();
  expect((screen.getByLabelText('检出分支') as HTMLSelectElement).value).toBe('');
});

it('displays discovery failures honestly while retaining default-clone fallback', async () => {
  vi.mocked(Git.remoteBranches).mockRejectedValue(new Error('permission denied'));
  render(<NewRepositoryDialog busy={false} onClose={() => {}} onCreate={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('仓库地址'), { target: { value: '/private/repo' } });
  await act(async () => {
    fireEvent.click(screen.getByText('读取远程分支'));
  });
  expect(screen.getByRole('alert').textContent).toContain('permission denied');
  expect(screen.getByRole('alert').textContent).toContain('仍可按远程默认分支克隆');
});

it('shows clone errors inside the still-open dialog', async () => {
  render(
    <NewRepositoryDialog
      busy={false}
      onClose={() => {}}
      onCreate={vi.fn().mockRejectedValue(new Error('目标目录已存在'))}
    />,
  );
  fireEvent.change(screen.getByLabelText('仓库地址'), { target: { value: '/remote/repo' } });
  fireEvent.change(screen.getByLabelText('保存到父文件夹'), { target: { value: '/tmp' } });
  fireEvent.change(screen.getByLabelText('新文件夹名称'), { target: { value: 'clone' } });
  await act(async () => {
    fireEvent.click(screen.getByText('克隆并打开'));
  });
  expect(screen.getByRole('alert').textContent).toContain('目标目录已存在');
  expect(screen.getByRole('dialog')).toBeTruthy();
});

it('shows real per-stage progress and targets cancellation to the active clone', async () => {
  let finish!: () => void;
  const create = vi.fn().mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  vi.mocked(Git.cloneProgress).mockImplementation(async (id) => ({
    id,
    state: 'running',
    phase: '正在接收对象',
    percent: 42,
    detail: 'Receiving objects: 42% (42/100), 2 MiB | 1 MiB/s',
    startedAt: new Date().toISOString(),
  }));
  vi.mocked(Git.cancelClone).mockResolvedValue(undefined);
  render(<NewRepositoryDialog busy={false} onClose={() => {}} onCreate={create} />);
  fireEvent.change(screen.getByLabelText('仓库地址'), { target: { value: '/local/fixture' } });
  fireEvent.change(screen.getByLabelText('保存到父文件夹'), { target: { value: '/tmp' } });
  fireEvent.change(screen.getByLabelText('新文件夹名称'), { target: { value: 'clone' } });
  await act(async () => {
    fireEvent.click(screen.getByText('克隆并打开'));
  });
  expect(screen.getByText('正在接收对象')).toBeTruthy();
  expect(screen.getByText('当前阶段 42% · 非整体进度')).toBeTruthy();
  expect(screen.getByLabelText('当前阶段进度').getAttribute('value')).toBe('42');
  expect(screen.getByText(/Receiving objects:/).textContent).toContain('MiB/s');
  expect((screen.getByLabelText('仓库地址') as HTMLInputElement).disabled).toBe(true);
  await act(async () => {
    fireEvent.click(screen.getByText('取消克隆'));
  });
  expect(Git.cancelClone).toHaveBeenCalledWith(create.mock.calls[0][6]);
  expect(screen.getByText('正在停止克隆…')).toBeTruthy();
  await act(async () => {
    finish();
  });
});

it('never fabricates a percentage while waiting for Git progress', async () => {
  let fail!: (error: Error) => void;
  const create = vi.fn().mockImplementation(
    () =>
      new Promise<void>((_, reject) => {
        fail = reject;
      }),
  );
  vi.mocked(Git.cloneProgress).mockRejectedValue(new Error('not registered yet'));
  render(<NewRepositoryDialog busy={false} onClose={() => {}} onCreate={create} />);
  fireEvent.change(screen.getByLabelText('仓库地址'), { target: { value: '/local/fixture' } });
  fireEvent.change(screen.getByLabelText('保存到父文件夹'), { target: { value: '/tmp' } });
  fireEvent.change(screen.getByLabelText('新文件夹名称'), { target: { value: 'clone' } });
  await act(async () => {
    fireEvent.click(screen.getByText('克隆并打开'));
  });
  expect(screen.getByLabelText('当前阶段进度').hasAttribute('value')).toBe(false);
  expect((screen.getByText('取消克隆') as HTMLButtonElement).disabled).toBe(true);
  await act(async () => {
    fail(new Error('克隆已取消；目标目录已保留'));
  });
  expect(screen.getByRole('alert').textContent).toContain('目标目录已保留');
  expect(screen.getByText('克隆未完成')).toBeTruthy();
});
