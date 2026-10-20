// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { installNativeOverlaySync } from './native-overlays';
import { Workbench } from './workbench-api';
vi.mock('mygo-runtime', () => ({ isMyGo: () => true }));
vi.mock('./workbench-api', () => ({ Workbench: { modal: vi.fn(async () => {}) } }));
afterEach(() => {
  document.body.innerHTML = '';
  delete window.__SAKURAGIT_EMBEDDED__;
  vi.clearAllMocks();
});

it('temporarily gives React dialogs the full workbench and restores the dock on close', async () => {
  window.__SAKURAGIT_EMBEDDED__ = true;
  const stop = installNativeOverlaySync();
  const dialog = document.createElement('div');
  dialog.setAttribute('role', 'dialog');
  document.body.appendChild(dialog);
  await vi.waitFor(() => expect(Workbench.modal).toHaveBeenLastCalledWith(true));
  dialog.remove();
  await vi.waitFor(() => expect(Workbench.modal).toHaveBeenLastCalledWith(false));
  expect(Workbench.modal).toHaveBeenCalledTimes(2);
  stop();
});

it('does not send native layout calls from the standalone web preview', async () => {
  const stop = installNativeOverlaySync();
  document.body.innerHTML = '<div role="dialog"></div>';
  await Promise.resolve();
  expect(Workbench.modal).not.toHaveBeenCalled();
  stop();
});
