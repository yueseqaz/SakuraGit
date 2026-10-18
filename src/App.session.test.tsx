// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from './App';
import { Git } from './mygo';
import { cacheSession, emptySession, readSessionCache } from './session';
import { demoSnapshot } from './demo';
vi.mock('mygo-runtime', () => ({ isMyGo: () => true }));
vi.mock('./mygo', () => ({
  Git: {
    bootstrap: vi.fn(),
    preferences: vi.fn(),
    open: vi.fn(),
    diff: vi.fn(),
    saveSession: vi.fn(),
    operationStatus: vi.fn(),
    history: vi.fn(),
  },
  events: { settingsRequested: { on: () => () => {} } },
}));
vi.mock('./DiffPanel', () => ({ DiffPanel: () => <div data-testid="mock-diff" /> }));
vi.mock('./HistoryDetails', () => ({
  HistoryDetails: ({ commit }: { commit?: { hash: string } }) => (
    <div data-testid="selected-commit">{commit?.hash}</div>
  ),
}));
beforeEach(() => {
  localStorage.clear();
  vi.resetAllMocks();
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.mocked(Git.preferences).mockResolvedValue({
    palette: 'mist',
    appearance: 'light',
    codeSize: 12,
  });
  vi.mocked(Git.open).mockResolvedValue(demoSnapshot);
  vi.mocked(Git.diff).mockResolvedValue({
    path: '',
    text: '',
    binary: false,
    hunks: [],
    revision: '',
  });
  vi.mocked(Git.saveSession).mockResolvedValue(undefined);
  vi.mocked(Git.operationStatus).mockResolvedValue({
    id: '',
    state: 'idle',
    label: '',
    phase: '',
    percent: -1,
    detail: '',
    startedAt: 0,
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('rehydrates the selected file and draft, then caches edits immediately', async () => {
  const saved = {
    ...emptySession(),
    root: demoSnapshot.root,
    kind: 'file',
    path: demoSnapshot.files[1].path,
    updatedAt: 123,
    drafts: { [demoSnapshot.root]: { title: 'unfinished title', body: 'unfinished body' } },
  };
  vi.mocked(Git.bootstrap).mockResolvedValue({
    path: saved.root,
    session: saved,
    recents: [],
    ephemeral: false,
    explicitPath: false,
  });
  render(<App />);
  const input = (await screen.findByLabelText('提交说明')) as HTMLInputElement;
  expect(input.value).toBe('unfinished title');
  expect((screen.getByLabelText('提交详细说明') as HTMLTextAreaElement).value).toBe(
    'unfinished body',
  );
  await waitFor(() => expect(Git.diff).toHaveBeenLastCalledWith(saved.root, saved.path, false));
  fireEvent.change(input, { target: { value: 'updated draft' } });
  expect(readSessionCache().drafts[saved.root].title).toBe('updated draft');
  await waitFor(() =>
    expect(vi.mocked(Git.saveSession).mock.lastCall?.[0].drafts[saved.root].title).toBe(
      'updated draft',
    ),
  );
});
it('opens explicit CLI paths instead of a newer cached repository without mixing drafts', async () => {
  const other = '/another/repository';
  const cached = {
    ...emptySession(),
    root: other,
    updatedAt: 200,
    drafts: {
      [other]: { title: 'other draft', body: '' },
      [demoSnapshot.root]: { title: 'correct draft', body: '' },
    },
  };
  cacheSession(cached);
  vi.mocked(Git.bootstrap).mockResolvedValue({
    path: demoSnapshot.root,
    session: emptySession(),
    recents: [],
    ephemeral: false,
    explicitPath: true,
  });
  render(<App />);
  const input = (await screen.findByLabelText('提交说明')) as HTMLInputElement;
  expect(input.value).toBe('correct draft');
  expect(Git.open).toHaveBeenCalledWith(demoSnapshot.root);
  expect(readSessionCache().drafts[other].title).toBe('other draft');
});
it('restores an older selected commit beyond the first history page using a full-history lookup', async () => {
  const old = {
    ...demoSnapshot.commits[0],
    hash: 'f'.repeat(40),
    subject: 'older selected commit',
  };
  const saved = {
    ...emptySession(),
    root: demoSnapshot.root,
    view: 'history',
    kind: 'commit',
    hash: old.hash,
    updatedAt: 123,
  };
  vi.mocked(Git.bootstrap).mockResolvedValue({
    path: saved.root,
    session: saved,
    recents: [],
    ephemeral: false,
    explicitPath: false,
  });
  vi.mocked(Git.history).mockResolvedValue({
    commits: [old],
    hasMore: false,
    nextOffset: 1,
    revision: demoSnapshot.historyRevision,
  });
  render(<App />);
  await waitFor(() => expect(screen.getByTestId('selected-commit').textContent).toBe(old.hash));
  expect(Git.history).toHaveBeenCalledWith(saved.root, old.hash, '', 0);
  expect((screen.getByLabelText('搜索文件或提交') as HTMLInputElement).value).toBe(old.hash);
});
