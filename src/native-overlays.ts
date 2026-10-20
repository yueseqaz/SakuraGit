import { isMyGo } from 'mygo-runtime';
import { Workbench } from './workbench-api';

// A React modal must own the whole workspace, not a small pane above a live
// native terminal. Temporarily unmount only its view, never its PTY session.
export function installNativeOverlaySync() {
  if (!isMyGo() || !window.__SAKURAGIT_EMBEDDED__) return () => {};
  let previous = false;
  let queue = Promise.resolve();
  const update = () => {
    const open = !!document.querySelector('[role="dialog"]');
    if (open === previous) return;
    previous = open;
    queue = queue
      .catch(() => {})
      .then(() => Workbench.modal(open))
      .catch((error) => {
        console.error('Cannot synchronize native overlay', error);
      });
  };
  const observer = new MutationObserver(update);
  observer.observe(document.body, { childList: true, subtree: true });
  update();
  return () => {
    observer.disconnect();
    if (previous) void Workbench.modal(false);
  };
}
