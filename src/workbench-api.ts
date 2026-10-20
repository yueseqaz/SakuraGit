import { Git, events } from './mygo';
export type { ConflictDetails, FileBackup } from './mygo';

// Keep the workbench surface grouped while the generated bindings remain the
// single source of truth for method signatures and event payloads.
export const Workbench = {
  modal: Git.workbenchModal,
  toggleTerminal: Git.toggleTerminal,
  stageLines: Git.stageLines,
  conflict: Git.conflict,
  saveConflict: Git.saveConflict,
  fileBackups: Git.fileBackups,
  recoveryAction: Git.recoveryAction,
  historyAction: Git.historyAction,
};
export const onTerminalDockChanged = (listener: (visible: boolean) => void) =>
  events.terminalDockChanged.on(listener);
