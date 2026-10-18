// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { OperationBar } from './OperationBar';
import { Git } from './mygo';
vi.mock('mygo-runtime', () => ({ isMyGo: () => true }));
vi.mock('./mygo', () => ({ Git: { operationStatus: vi.fn(), cancelOperation: vi.fn() } }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  vi.useRealTimers();
});
it('does not display a previous completed operation for unrelated reads', async () => {
  vi.mocked(Git.operationStatus).mockResolvedValue({
    id: 'old',
    label: 'push',
    state: 'complete',
    phase: 'done',
    percent: 100,
    detail: '',
    startedAt: 1,
  });
  await act(async () => {
    render(<OperationBar busy="刷新" hidden={false} />);
  });
  expect(screen.queryByLabelText('当前操作进度')).toBeNull();
});
it('cancels the exact active operation and labels stage percentages honestly', async () => {
  vi.useFakeTimers();
  vi.mocked(Git.operationStatus).mockResolvedValue({
    id: 'active',
    label: 'push',
    state: 'running',
    phase: '发送对象',
    percent: 42,
    detail: 'transfer detail',
    startedAt: Date.now(),
  });
  vi.mocked(Git.cancelOperation).mockResolvedValue(undefined);
  await act(async () => {
    render(<OperationBar busy="推送" hidden={false} />);
  });
  expect(screen.getByText('当前阶段 42% · 非整体进度')).toBeTruthy();
  await act(async () => {
    fireEvent.click(screen.getByText('取消当前操作'));
  });
  expect(Git.cancelOperation).toHaveBeenCalledWith('active');
  expect(screen.getByText(/正在停止/)).toBeTruthy();
});
