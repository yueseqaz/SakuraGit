import './prism-worker-env';
import { highlightDiff } from './diff-highlight';
import type { DiffLine } from './git-view';
self.onmessage = (event: MessageEvent<{ lines: DiffLine[]; path: string }>) => {
  try {
    const map = highlightDiff(event.data.lines, event.data.path);
    self.postMessage({ spans: event.data.lines.map((line) => map.get(line) || null) });
  } catch {
    self.postMessage({ spans: [] });
  }
};
