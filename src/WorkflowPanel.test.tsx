// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { WorkflowPanel } from './WorkflowPanel';
import { Git } from './mygo';
import { demoSnapshot } from './demo';
vi.mock('mygo-runtime', () => ({ isMyGo: () => true }));
vi.mock('./mygo', () => ({
  Git: {
    workflow: vi.fn(),
    workflowAction: vi.fn(),
    ignoreFile: vi.fn(),
    openDevelopmentPath: vi.fn(),
  },
}));
const info = {
  revision: 'confirmed-revision',
  state: 'merge',
  head: 'head',
  conflicts: [demoSnapshot.files[0]],
  branches: [
    { name: 'main', oid: 'head', remote: false, current: true },
    { name: 'origin/topic', oid: 'head', remote: true, current: false },
  ],
  submodules: false,
  lfs: false,
};
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  localStorage.clear();
});
it('blocks continue with conflicts and confirms exact file/revision before marking resolved', async () => {
  vi.mocked(Git.workflow).mockResolvedValue(info);
  const run = vi.fn(async (_label, fn) => {
    await fn(demoSnapshot.root);
    return true;
  });
  await act(async () => {
    render(
      <WorkflowPanel
        snapshot={demoSnapshot}
        version={1}
        busy={false}
        run={run}
        onSelectConflict={() => {}}
      />,
    );
  });
  expect((screen.getByText('继续流程') as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByText('标记已解决'));
  expect(run).not.toHaveBeenCalled();
  await act(async () => {
    fireEvent.click(screen.getByText('确认执行'));
  });
  expect(Git.workflowAction).toHaveBeenCalledWith(
    demoSnapshot.root,
    'resolve',
    demoSnapshot.files[0].path,
    '',
    'confirmed-revision',
  );
});
it('keeps local and remote branch selections separate during remote checkout', async () => {
  vi.mocked(Git.workflow).mockResolvedValue({ ...info, state: '', conflicts: [] });
  const run = vi.fn(async (_label, fn) => {
    await fn(demoSnapshot.root);
    return true;
  });
  await act(async () => {
    render(
      <WorkflowPanel
        snapshot={demoSnapshot}
        version={1}
        busy={false}
        run={run}
        onSelectConflict={() => {}}
      />,
    );
  });
  fireEvent.change(screen.getByLabelText('操作'), { target: { value: 'checkout-remote' } });
  fireEvent.change(screen.getByLabelText('已有远程分支（不会自动 Fetch）'), {
    target: { value: 'origin/topic' },
  });
  fireEvent.change(screen.getByLabelText('新本地分支名称'), { target: { value: 'topic' } });
  expect((screen.getByLabelText('本地分支') as HTMLSelectElement).value).toBe('main');
  fireEvent.click(screen.getByText('检查并确认…'));
  await act(async () => {
    fireEvent.click(screen.getByText('确认执行'));
  });
  expect(Git.workflowAction).toHaveBeenCalledWith(
    demoSnapshot.root,
    'checkout-remote',
    'origin/topic',
    'topic',
    'confirmed-revision',
  );
});
