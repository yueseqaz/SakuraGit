import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from 'react';

type SplitOptions = {
  name: string;
  label: string;
  axis?: 'horizontal' | 'vertical';
  initial: number;
  minFirst: number;
  minSecond: number;
};
const storageKey = (name: string) => `gitlane.layout.v1.${name}`;
export function splitBounds(size: number, first: number, second: number) {
  if (size <= 0) return { min: 0.1, max: 0.9 };
  const scale = Math.min(1, size / (first + second));
  return { min: (first * scale) / size, max: 1 - (second * scale) / size };
}
export function readSplit(name: string, initial: number) {
  try {
    const raw = localStorage.getItem(storageKey(name));
    const value = raw === null ? NaN : Number(raw);
    return Number.isFinite(value) && value > 0 && value < 1 ? value : initial;
  } catch {
    return initial;
  }
}
export function useSplitLayout({
  name,
  label,
  axis = 'horizontal',
  initial,
  minFirst,
  minSecond,
}: SplitOptions) {
  const ref = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState(() => readSplit(name, initial));
  const value = useRef(ratio);
  value.current = ratio;
  const [size, setSize] = useState(0);
  const [dragging, setDragging] = useState(false);
  const cleanup = useRef<(() => void) | null>(null);
  const bounds = splitBounds(size, minFirst, minSecond);
  const clamp = (n: number) => Math.max(bounds.min, Math.min(bounds.max, n));
  const effective = clamp(ratio);
  const persist = (n: number) => {
    try {
      localStorage.setItem(storageKey(name), String(n));
    } catch {
      /* Resizing remains usable without storage. */
    }
  };
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () =>
      setSize(axis === 'horizontal' ? element.clientWidth : element.clientHeight);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(element);
    window.addEventListener('resize', update);
    update();
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', update);
      cleanup.current?.();
    };
  }, [axis]);
  const start = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !ref.current || window.innerWidth <= 760) return;
    event.preventDefault();
    cleanup.current?.();
    const element = ref.current;
    const rect = element.getBoundingClientRect();
    const extent = axis === 'horizontal' ? rect.width : rect.height;
    if (!extent) return;
    const limits = splitBounds(extent, minFirst, minSecond);
    const original = value.current;
    const pointer = event.pointerId;
    const handle = event.currentTarget;
    setDragging(true);
    const root = document.documentElement;
    root.classList.add(axis === 'horizontal' ? 'resizing-columns' : 'resizing-rows');
    const update = (e: globalThis.PointerEvent) => {
      if (e.pointerId !== pointer) return;
      const offset = axis === 'horizontal' ? e.clientX - rect.left : e.clientY - rect.top;
      value.current = Math.max(limits.min, Math.min(limits.max, offset / extent));
      setRatio(value.current);
    };
    const clear = () => {
      window.removeEventListener('pointermove', update);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('keydown', key);
      root.classList.remove('resizing-columns', 'resizing-rows');
      handle.removeEventListener('lostpointercapture', cancel);
      if (handle.hasPointerCapture?.(pointer)) handle.releasePointerCapture(pointer);
      cleanup.current = null;
    };
    const cancel = () => {
      setRatio(original);
      value.current = original;
      setDragging(false);
      clear();
    };
    const finish = (e: globalThis.PointerEvent) => {
      if (e.pointerId !== pointer) return;
      update(e);
      persist(value.current);
      setDragging(false);
      clear();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      }
    };
    window.addEventListener('pointermove', update);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', cancel);
    window.addEventListener('keydown', key);
    handle.addEventListener('lostpointercapture', cancel);
    try {
      handle.setPointerCapture?.(pointer);
    } catch {
      /* Window listeners still handle the drag. */
    }
    cleanup.current = clear;
  };
  const separator = (
    <div
      role="separator"
      aria-label={label}
      aria-orientation={axis === 'horizontal' ? 'vertical' : 'horizontal'}
      aria-valuemin={Math.round(bounds.min * 100)}
      aria-valuemax={Math.round(bounds.max * 100)}
      aria-valuenow={Math.round(effective * 100)}
      aria-valuetext={`${Math.round(effective * 100)}%`}
      tabIndex={0}
      className={`split-handle ${axis} ${name === 'sidebar' ? 'sidebar-handle' : ''} ${dragging ? 'dragging' : ''}`}
      title="拖动调整大小 / 双击恢复默认 / 方向键微调 / Esc 取消拖动"
      onPointerDown={start}
      onDoubleClick={() => {
        setRatio(initial);
        persist(initial);
      }}
      onKeyDown={(event) => {
        const decrease = axis === 'horizontal' ? 'ArrowLeft' : 'ArrowUp';
        const increase = axis === 'horizontal' ? 'ArrowRight' : 'ArrowDown';
        if (![decrease, increase, 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const step = (event.shiftKey ? 64 : 16) / (size || 1000);
        const next =
          event.key === 'Home'
            ? bounds.min
            : event.key === 'End'
              ? bounds.max
              : clamp(effective + (event.key === increase ? step : -step));
        setRatio(next);
        persist(next);
      }}
    />
  );
  return { ref, style: { '--split-first': `${effective * 100}%` } as CSSProperties, separator };
}
export function ResizableSplit({
  children,
  className,
  ...options
}: SplitOptions & { children: ReactNode; className: string }) {
  const layout = useSplitLayout(options);
  return (
    <div
      ref={layout.ref}
      style={layout.style}
      className={`${className} resizable-split split-${options.axis || 'horizontal'}`}
    >
      {children}
      {layout.separator}
    </div>
  );
}
