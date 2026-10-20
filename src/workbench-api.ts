import { call, event } from 'mygo-runtime';
import type { Result } from './mygo';

export interface ConflictDetails {
  path: string;
  base: string;
  ours: string;
  theirs: string;
  result: string;
  revision: string;
  state: string;
}
export interface FileBackup {
  id: string;
  path: string;
  createdAt: string;
  content: string;
}

export const Workbench = {
  toggleTerminal: (root: string): Promise<void> => call('Git.ToggleTerminal', root),
  stageLines: (
    root: string,
    path: string,
    staged: boolean,
    revision: string,
    positions: number[],
  ): Promise<Result> => call('Git.StageLines', root, path, staged, revision, positions),
  conflict: (root: string, path: string): Promise<ConflictDetails> =>
    call('Git.Conflict', root, path),
  saveConflict: (root: string, path: string, revision: string, result: string): Promise<Result> =>
    call('Git.SaveConflict', root, path, revision, result),
  fileBackups: (root: string): Promise<FileBackup[]> => call('Git.FileBackups', root),
  recoveryAction: (root: string, action: string, path: string, revision: string): Promise<Result> =>
    call('Git.RecoveryAction', root, action, path, revision),
  historyAction: (root: string, action: string, hash: string, revision: string): Promise<Result> =>
    call('Git.HistoryAction', root, action, hash, revision),
};
export const onTerminalDockChanged = (listener: (visible: boolean) => void) =>
  event<boolean>('terminal-dock-changed').on(listener);
