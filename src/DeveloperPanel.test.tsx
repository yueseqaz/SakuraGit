// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DeveloperPanel, parseVariables } from './DeveloperPanel';
import { Git } from './mygo';
vi.mock('mygo-runtime', () => ({ isMyGo: () => true }));
vi.mock('./mygo', () => ({
  Git: {
    developerConfig: vi.fn(),
    developmentEnvironment: vi.fn(),
    saveDeveloperConfig: vi.fn(),
    runDeveloperCommand: vi.fn(),
  },
}));
const command = { id: 'dev', name: '开发服务', command: 'npm run dev', directory: 'web' };
beforeEach(() => {
  vi.mocked(Git.developerConfig).mockResolvedValue({ commands: [command], variables: [] });
  vi.mocked(Git.developmentEnvironment).mockResolvedValue({
    shell: '/bin/zsh',
    source: 'fixture',
    warning: '',
    variables: [],
    tools: [{ name: 'node', path: '/tools/node', version: 'v24' }],
  });
  vi.mocked(Git.saveDeveloperConfig).mockResolvedValue(undefined);
  vi.mocked(Git.runDeveloperCommand).mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it('parses literal values and rejects duplicate or invalid variables', () => {
  expect(parseVariables('JAVA_HOME=/a b\nAPP=a=b\n')).toEqual([
    { name: 'JAVA_HOME', value: '/a b' },
    { name: 'APP', value: 'a=b' },
  ]);
  expect(() => parseVariables('PATH=a\nPATH=b')).toThrow();
  expect(() => parseVariables('invalid line')).toThrow();
});
it('only runs the selected saved command on explicit click', async () => {
  const onStarted = vi.fn();
  await act(async () => {
    render(<DeveloperPanel root="/project" onClose={vi.fn()} onStarted={onStarted} />);
  });
  expect(Git.runDeveloperCommand).not.toHaveBeenCalled();
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /^运行$/ }));
  });
  expect(Git.runDeveloperCommand).toHaveBeenCalledExactlyOnceWith('/project', command);
  expect(onStarted).toHaveBeenCalledOnce();
});
it('saves environment overrides without changing system settings', async () => {
  await act(async () => {
    render(
      <DeveloperPanel
        root="/project"
        initialTab="environment"
        onClose={vi.fn()}
        onStarted={vi.fn()}
      />,
    );
  });
  fireEvent.change(screen.getByLabelText('此仓库的环境变量覆盖'), {
    target: { value: 'JAVA_HOME=/jdk' },
  });
  await act(async () => {
    fireEvent.click(screen.getByText('保存环境变量'));
  });
  expect(Git.saveDeveloperConfig).toHaveBeenCalledWith('/project', {
    commands: [command],
    variables: [{ name: 'JAVA_HOME', value: '/jdk' }],
  });
  expect(screen.getByText('v24')).toBeTruthy();
});
it('saves custom scripts but does not execute them on save', async () => {
  await act(async () => {
    render(<DeveloperPanel root="/project" onClose={vi.fn()} onStarted={vi.fn()} />);
  });
  fireEvent.click(screen.getByText('编辑'));
  fireEvent.change(screen.getByLabelText('Shell 命令'), {
    target: { value: 'go run .\necho done' },
  });
  await act(async () => {
    fireEvent.click(screen.getByText('保存命令'));
  });
  expect(Git.saveDeveloperConfig).toHaveBeenCalledWith('/project', {
    commands: [{ ...command, command: 'go run .\necho done' }],
    variables: [],
  });
  expect(Git.runDeveloperCommand).not.toHaveBeenCalled();
});
