import { isMyGo } from 'mygo-runtime';
import { Git } from './mygo';

export function installTextContextMenu() {
  if (!isMyGo()) return () => {};
  let menuOpen = false;
  const contextMenu = (event: MouseEvent) => {
    event.preventDefault();
    if (menuOpen) return;
    const target = event.composedPath().find((node) => node instanceof HTMLElement) as
      HTMLElement | undefined;
    const field = target?.closest('input, textarea, [contenteditable]');
    const input =
      field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement ? field : null;
    const editable = input
      ? !input.disabled &&
        !input.readOnly &&
        ![
          'button',
          'checkbox',
          'radio',
          'submit',
          'reset',
          'file',
          'range',
          'color',
          'hidden',
          'image',
        ].includes(input.type)
      : field instanceof HTMLElement && field.isContentEditable;
    const selected = input
      ? input.selectionStart !== null && input.selectionEnd !== input.selectionStart
      : !!window.getSelection()?.toString();
    if (!editable && !selected) return;
    // Focusing another input must not disturb selection in the current editor.
    if (editable && field instanceof HTMLElement && document.activeElement !== field) field.focus();
    menuOpen = true;
    void Git.textContextMenu(!!editable, selected)
      .catch((error) => console.error('Cannot open text editing menu', error))
      .finally(() => {
        menuOpen = false;
      });
  };
  window.addEventListener('contextmenu', contextMenu);
  return () => window.removeEventListener('contextmenu', contextMenu);
}
