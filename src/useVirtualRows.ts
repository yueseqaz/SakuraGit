import { useEffect, useRef, useState } from 'react';
export function virtualRange(
  count: number,
  rowHeight: number,
  top: number,
  height: number,
  enabled = true,
) {
  if (!enabled) return { start: 0, end: count, before: 0, after: 0 };
  const start = Math.max(0, Math.min(Math.max(0, count - 1), Math.floor(top / rowHeight) - 8));
  const end = Math.min(count, start + Math.ceil(height / rowHeight) + 16);
  return { start, end, before: start * rowHeight, after: Math.max(0, (count - end) * rowHeight) };
}
export function useVirtualRows(
  count: number,
  rowHeight: number,
  threshold: number,
  reset: string,
  selectedIndex = -1,
) {
  const ref = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ top: 0, height: 600 });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () =>
      setViewport({ top: element.scrollTop, height: element.clientHeight || 600 });
    element.addEventListener('scroll', update, { passive: true });
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    observer?.observe(element);
    update();
    return () => {
      element.removeEventListener('scroll', update);
      observer?.disconnect();
    };
  }, [reset, count > threshold]);
  useEffect(() => {
    if (ref.current) {
      ref.current.scrollTop = 0;
      setViewport((v) => ({ ...v, top: 0 }));
    }
  }, [reset]);
  useEffect(() => {
    const element = ref.current;
    if (!element || count <= threshold || selectedIndex < 0) return;
    const top = selectedIndex * rowHeight;
    if (top < element.scrollTop || top + rowHeight > element.scrollTop + element.clientHeight) {
      element.scrollTop = top;
      setViewport({ top, height: element.clientHeight || 600 });
    }
    // Appending a page can enable virtualization; do not jump back to the selected row.
  }, [reset, selectedIndex]);
  return {
    ref,
    ...virtualRange(count, rowHeight, viewport.top, viewport.height, count > threshold),
    enabled: count > threshold,
  };
}
