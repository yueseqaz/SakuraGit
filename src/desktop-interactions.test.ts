// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import guard from '../desktop-guard.js?raw';
import { installTextContextMenu } from './desktop-interactions';
import { Git } from './mygo';
import { isMyGo } from 'mygo-runtime';

vi.mock('mygo-runtime', () => ({ isMyGo: vi.fn(() => true) }));
vi.mock('./mygo', () => ({ Git: { textContextMenu: vi.fn().mockResolvedValue(undefined) } }));
let cleanup = () => {};
let removeGuard = () => {};
afterEach(() => {
  cleanup();
  removeGuard();
  document.body.innerHTML = '';
  window.getSelection()?.removeAllRanges();
  vi.mocked(isMyGo).mockReturnValue(true);
  vi.mocked(Git.textContextMenu).mockReset().mockResolvedValue(undefined);
});

it('blocks reload shortcuts and default context menus before React without blocking editing keys', () => {
  removeGuard = new Function('window', `return ${guard}`)(window);
  for (const props of [
    { key: 'F5' },
    { key: 'F5', ctrlKey: true },
    { key: 'r', metaKey: true },
    { key: 'R', ctrlKey: true, shiftKey: true },
    { key: 'к', code: 'KeyR', metaKey: true },
  ]) {
    const event = new KeyboardEvent('keydown', { ...props, bubbles: true, cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  }
  for (const props of [
    { key: 'r' },
    { key: 'c', metaKey: true },
    { key: 'v', ctrlKey: true },
    { key: 'z', metaKey: true },
    { key: 'r', ctrlKey: true, altKey: true },
    { key: 'Escape' },
  ]) {
    const event = new KeyboardEvent('keydown', { ...props, bubbles: true, cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  }
  const input = document.createElement('textarea');
  document.body.append(input);
  const context = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
  input.dispatchEvent(context);
  expect(context.defaultPrevented).toBe(true);
});

it('opens only a text-editing menu and preserves the focused input selection', async () => {
  cleanup = installTextContextMenu();
  const input = document.createElement('textarea');
  document.body.append(input);
  input.value = 'commit message';
  input.focus();
  input.setSelectionRange(0, 6);
  input.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  expect(Git.textContextMenu).toHaveBeenCalledWith(true, true);
  expect(input.selectionStart).toBe(0);
  expect(input.selectionEnd).toBe(6);
});

it('allows copying selected read-only code but opens nothing over blank UI', () => {
  cleanup = installTextContextMenu();
  document.body.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  expect(Git.textContextMenu).not.toHaveBeenCalled();
  const code = document.createElement('pre');
  code.textContent = 'const blue = true;';
  document.body.append(code);
  const range = document.createRange();
  range.selectNodeContents(code);
  window.getSelection()?.addRange(range);
  code.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  expect(Git.textContextMenu).toHaveBeenCalledWith(false, true);
});

it('does not expose mutations for readonly inputs or intercept regular browser preview menus', () => {
  cleanup = installTextContextMenu();
  const input = document.createElement('input');
  input.readOnly = true;
  input.value = 'repo/path';
  document.body.append(input);
  input.setSelectionRange(0, 4);
  input.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  expect(Git.textContextMenu).toHaveBeenCalledWith(false, true);
  cleanup();
  vi.mocked(Git.textContextMenu).mockClear();
  vi.mocked(isMyGo).mockReturnValue(false);
  cleanup = installTextContextMenu();
  const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
  input.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(false);
  expect(Git.textContextMenu).not.toHaveBeenCalled();
});

it('does not open editing menus on checkboxes and releases its menu lock on IPC failure', async () => {
  cleanup = installTextContextMenu();
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  document.body.append(checkbox);
  checkbox.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  expect(Git.textContextMenu).not.toHaveBeenCalled();
  const input = document.createElement('input');
  document.body.append(input);
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.mocked(Git.textContextMenu).mockRejectedValueOnce(new Error('IPC failure'));
  input.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  input.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  expect(Git.textContextMenu).toHaveBeenCalledTimes(2);
  error.mockRestore();
});
