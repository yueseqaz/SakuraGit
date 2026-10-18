import { useEffect, useMemo, useState } from 'react';
import type { DiffLine } from './git-view';
import type { CodeSpan } from './diff-highlight';
import HighlightWorker from './diff-worker?worker&inline';

export function useDiffHighlight(lines: DiffLine[], path: string) {
  const [result, setResult] = useState<{
    lines: DiffLine[];
    path: string;
    mode: 'worker' | 'fallback';
    spans: (CodeSpan[] | null)[];
  } | null>(null);
  useEffect(() => {
    if (!lines.length) return;
    let worker: Worker | undefined;
    let active = true;
    let settled = false;
    let timer: ReturnType<typeof setTimeout>;
    const fallback = () => {
      if (settled || !active) return;
      settled = true;
      clearTimeout(timer);
      worker?.terminate();
      // Some WKWebView custom-scheme origins cannot run even bundled Blob workers.
      // Only small diffs may use the deferred main-thread fallback; large ones stay plain.
      if (
        lines.length > 400 ||
        lines.reduce((n, line) => n + line.text.length, 0) > 32000 ||
        lines.some((line) => line.text.length > 2000)
      )
        return;
      void import('./diff-highlight')
        .then(({ highlightDiff }) => {
          if (!active) return;
          const spans = highlightDiff(lines, path);
          if (active)
            setResult({
              lines,
              path,
              mode: 'fallback',
              spans: lines.map((line) => spans.get(line) || null),
            });
        })
        .catch(() => {
          /* Preserve readable plain text when highlighting is unavailable. */
        });
    };
    try {
      if (typeof Worker === 'undefined') fallback();
      else {
        worker = new HighlightWorker();
        timer = setTimeout(fallback, 5000);
        worker.onmessage = (event: MessageEvent<{ spans: (CodeSpan[] | null)[] }>) => {
          if (active && !settled) {
            settled = true;
            setResult({ lines, path, mode: 'worker', spans: event.data.spans });
            clearTimeout(timer);
            worker?.terminate();
          }
        };
        worker.onerror = fallback;
        worker.postMessage({ lines, path });
      }
    } catch {
      fallback();
    }
    return () => {
      active = false;
      clearTimeout(timer);
      worker?.terminate();
    };
  }, [lines, path]);
  const current = result?.lines === lines && result.path === path;
  const spans = useMemo(
    () =>
      new Map(
        lines.flatMap((line, i) =>
          current && result.spans[i] ? [[line, result.spans[i]!] as const] : [],
        ),
      ),
    [lines, result, current],
  );
  return { spans, mode: current ? result.mode : 'plain' };
}
