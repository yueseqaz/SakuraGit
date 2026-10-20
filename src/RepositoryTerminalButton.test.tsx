// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { isMyGo } from 'mygo-runtime';
import { Workbench } from './workbench-api';
import { RepositoryTerminalButton } from './RepositoryTerminalButton';

vi.mock('mygo-runtime', () => ({ isMyGo: vi.fn(() => true) }));
vi.mock('./workbench-api', () => ({
  Workbench: { toggleTerminal: vi.fn() },
  onTerminalDockChanged: () => () => {},
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  vi.mocked(isMyGo).mockReturnValue(true);
});

it('opens the selected repository without sending a command or editor', async () => {
  vi.mocked(Workbench.toggleTerminal).mockResolvedValue(undefined);
  const onError = vi.fn();
  render(<RepositoryTerminalButton root="/fixture/project" disabled={false} onError={onError} />);
  await act(async () => {
    fireEvent.click(screen.getByLabelText('打开仓库内置终端'));
  });
  expect(Workbench.toggleTerminal).toHaveBeenCalledExactlyOnceWith('/fixture/project');
  expect(onError).not.toHaveBeenCalled();
});

it('deduplicates launch requests and reports startup errors', async () => {
  let reject!: (error: Error) => void;
  vi.mocked(Workbench.toggleTerminal).mockImplementation(
    () =>
      new Promise((_, fail) => {
        reject = fail;
      }),
  );
  const onError = vi.fn();
  render(<RepositoryTerminalButton root="/fixture" disabled={false} onError={onError} />);
  fireEvent.keyDown(window, { code: 'Backquote', ctrlKey: true });
  fireEvent.keyDown(window, { code: 'Backquote', metaKey: true });
  expect(Workbench.toggleTerminal).toHaveBeenCalledTimes(1);
  const error = new Error('runtime library missing');
  await act(async () => {
    reject(error);
  });
  expect(onError).toHaveBeenCalledWith(error);
  await waitFor(() =>
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(false),
  );
});

it('never opens from browser preview, a modal, or a busy workspace', () => {
  const props = { root: '/fixture', disabled: false, onError: vi.fn() };
  vi.mocked(isMyGo).mockReturnValue(false);
  const view = render(<RepositoryTerminalButton {...props} />);
  fireEvent.keyDown(window, { code: 'Backquote', ctrlKey: true });
  expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);
  vi.mocked(isMyGo).mockReturnValue(true);
  view.rerender(<RepositoryTerminalButton {...props} disabled />);
  fireEvent.keyDown(window, { code: 'Backquote', ctrlKey: true });
  view.rerender(
    <>
      <RepositoryTerminalButton {...props} />
      <div role="dialog" />
    </>,
  );
  fireEvent.keyDown(window, { code: 'Backquote', ctrlKey: true });
  expect(Workbench.toggleTerminal).not.toHaveBeenCalled();
});
