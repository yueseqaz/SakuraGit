// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EditorWorkbench } from './EditorWorkbench';
import { Git } from './mygo';
import { demoSnapshot } from './demo';
vi.mock('mygo-runtime', () => ({ isMyGo: () => true }));
vi.mock('./mygo', () => ({
  Git: {
    editorDirectory: vi.fn(),
    editorFile: vi.fn(),
    editorPreview: vi.fn(),
    editorDirty: vi.fn(),
    saveEditorFile: vi.fn(),
  },
}));
vi.mock('./EditorSurface', () => ({
  EditorSurface: ({
    path,
    content,
    onChange,
    onSave,
  }: {
    path: string;
    content: string;
    onChange: (text: string) => void;
    onSave: () => void;
  }) => (
    <textarea
      aria-label={`编辑代码 ${path}`}
      defaultValue={content}
      onChange={(e) =>
        onChange(e.target.value.replace(/\r?\n/g, content.includes('\r\n') ? '\r\n' : '\n'))
      }
      onKeyDown={(e) => {
        if (e.ctrlKey && e.key === 's') onSave();
      }}
    />
  ),
}));
const file = { path: 'test.ts', content: 'before\r\n', revision: 'a'.repeat(64) };
const run = vi.fn(async (_label, fn) => {
  await fn(demoSnapshot.root);
  return true;
});
beforeEach(() => {
  vi.mocked(Git.editorDirectory).mockResolvedValue({
    entries: [{ name: file.path, path: file.path, directory: false }],
    truncated: false,
  });
  vi.mocked(Git.editorFile).mockResolvedValue(file);
  vi.mocked(Git.editorPreview).mockRejectedValue(new Error('not previewable'));
  vi.mocked(Git.editorDirty).mockResolvedValue(undefined);
  vi.mocked(Git.saveEditorFile).mockImplementation(async (_root, path, _revision, content) => ({
    path,
    content,
    revision: 'b'.repeat(64),
  }));
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.resetAllMocks();
});
it('falls back to binary preview without creating a writable or dirty buffer', async () => {
  vi.mocked(Git.editorFile).mockRejectedValue(new Error('binary file'));
  vi.mocked(Git.editorPreview).mockResolvedValue({
    path: file.path,
    offset: 0,
    size: 5,
    data: btoa('\x00\xffABC'),
    mime: '',
    image: false,
    more: false,
  });
  await setup();
  expect(screen.getByLabelText('二进制只读预览')).toBeTruthy();
  expect(screen.queryByLabelText('编辑代码 test.ts')).toBeNull();
  expect(screen.queryByLabelText('未保存')).toBeNull();
  expect((screen.getByRole('button', { name: /^保存$/ }) as HTMLButtonElement).disabled).toBe(true);
  expect(Git.saveEditorFile).not.toHaveBeenCalled();
});
async function setup() {
  let result!: ReturnType<typeof render>;
  await act(async () => {
    result = render(
      <EditorWorkbench
        snapshot={demoSnapshot}
        visible
        requested={null}
        busy={false}
        run={run}
        onDiff={vi.fn()}
      />,
    );
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'test.ts' }));
  });
  return result;
}
it('saves the exact revision/content, leaves staging separate and clears the draft', async () => {
  await setup();
  fireEvent.change(screen.getByLabelText('编辑代码 test.ts'), { target: { value: 'after\r\n' } });
  expect(screen.getByLabelText('未保存')).toBeTruthy();
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /^保存$/ }));
  });
  expect(Git.saveEditorFile).toHaveBeenCalledWith(
    demoSnapshot.root,
    file.path,
    file.revision,
    'after\r\n',
  );
  expect(screen.queryByLabelText('未保存')).toBeNull();
  expect(Git.editorDirty).toHaveBeenLastCalledWith(0);
});
it('keeps dirty content after a failed save and requires confirmation before closing', async () => {
  const failing = vi.fn(async () => false);
  await act(async () => {
    render(
      <EditorWorkbench
        snapshot={demoSnapshot}
        visible
        requested={{ root: demoSnapshot.root, path: file.path, sequence: 1 }}
        busy={false}
        run={failing}
        onDiff={vi.fn()}
      />,
    );
  });
  fireEvent.change(screen.getByLabelText('编辑代码 test.ts'), { target: { value: 'draft' } });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /^保存$/ }));
  });
  expect(screen.getByLabelText('未保存')).toBeTruthy();
  fireEvent.click(screen.getByLabelText('关闭 test.ts'));
  expect(screen.getByRole('dialog')).toBeTruthy();
  fireEvent.click(screen.getByText('继续编辑'));
  expect((screen.getByLabelText('编辑代码 test.ts') as HTMLTextAreaElement).value).toBe('draft');
  fireEvent.click(screen.getByLabelText('关闭 test.ts'));
  await act(async () => {
    fireEvent.click(screen.getByText('放弃编辑并关闭'));
  });
  expect(screen.queryByLabelText('编辑代码 test.ts')).toBeNull();
});
it('keeps buffers scoped when switching repositories', async () => {
  const view = await setup();
  fireEvent.change(screen.getByLabelText('编辑代码 test.ts'), { target: { value: 'draft' } });
  await act(async () => {
    view.rerender(
      <EditorWorkbench
        snapshot={{ ...demoSnapshot, root: '/different' }}
        visible
        requested={null}
        busy={false}
        run={run}
        onDiff={vi.fn()}
      />,
    );
  });
  expect(screen.queryByRole('tab', { name: /test.ts/ })).toBeNull();
  expect(Git.editorDirty).toHaveBeenLastCalledWith(1);
  await act(async () => {
    view.rerender(
      <EditorWorkbench
        snapshot={demoSnapshot}
        visible
        requested={null}
        busy={false}
        run={run}
        onDiff={vi.fn()}
      />,
    );
  });
  expect((screen.getByLabelText('编辑代码 test.ts') as HTMLTextAreaElement).value).toBe('draft');
});

it('keeps edits typed during an in-flight save dirty against the saved revision', async () => {
  let finish!: (result: typeof file) => void;
  vi.mocked(Git.saveEditorFile).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await setup();
  fireEvent.change(screen.getByLabelText('编辑代码 test.ts'), { target: { value: 'first' } });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /^保存$/ }));
  });
  fireEvent.change(screen.getByLabelText('编辑代码 test.ts'), { target: { value: 'second' } });
  await act(async () => {
    finish({ ...file, content: 'first', revision: 'b'.repeat(64) });
  });
  expect((screen.getByLabelText('编辑代码 test.ts') as HTMLTextAreaElement).value).toBe('second');
  expect(screen.getByLabelText('未保存')).toBeTruthy();
  expect(Git.editorDirty).toHaveBeenLastCalledWith(1);
  vi.mocked(Git.saveEditorFile).mockResolvedValue({
    ...file,
    content: 'second',
    revision: 'c'.repeat(64),
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /^保存$/ }));
  });
  expect(Git.saveEditorFile).toHaveBeenLastCalledWith(
    demoSnapshot.root,
    file.path,
    'b'.repeat(64),
    'second',
  );
});

it('retains the draft if a confirmed disk reload fails', async () => {
  await setup();
  fireEvent.change(screen.getByLabelText('编辑代码 test.ts'), {
    target: { value: 'important draft' },
  });
  fireEvent.click(screen.getByText('重新读取'));
  vi.mocked(Git.editorFile).mockRejectedValue(new Error('file disappeared'));
  await act(async () => {
    fireEvent.click(screen.getByText('放弃编辑并重新读取'));
  });
  expect((screen.getByLabelText('编辑代码 test.ts') as HTMLTextAreaElement).value).toBe(
    'important draft',
  );
  expect(screen.getByLabelText('未保存')).toBeTruthy();
  expect(screen.getByRole('dialog')).toBeTruthy();
});
