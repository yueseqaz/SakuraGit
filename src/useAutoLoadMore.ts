import { useEffect, useRef, type RefObject } from 'react';

type PageState = {
  key: string;
  count: number;
  loading: boolean;
  error: string;
  hasMore: boolean;
  loadMore: () => void;
};
export function useAutoLoadMore(ref: RefObject<HTMLDivElement | null>, state: PageState) {
  const latest = useRef(state);
  latest.current = state;
  const attempted = useRef('');
  const previousKey = useRef(state.key);
  useEffect(() => {
    const element = ref.current;
    if (state.error || previousKey.current !== state.key) attempted.current = '';
    previousKey.current = state.key;
    if (!element) return;
    let active = true;
    const check = () => {
      const current = latest.current;
      if (
        !active ||
        current.key !== state.key ||
        current.loading ||
        current.error ||
        !current.hasMore ||
        !current.count ||
        element.clientHeight <= 0
      )
        return;
      const remaining = element.scrollHeight - element.scrollTop - element.clientHeight;
      if (remaining > Math.max(240, element.clientHeight * 0.6)) return;
      const token = JSON.stringify([current.key, current.count]);
      // Stop retry loops if a page fails or returns no additional rows.
      if (attempted.current === token) return;
      attempted.current = token;
      current.loadMore();
    };
    element.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(check);
    observer?.observe(element);
    const timer = setTimeout(check, 0);
    return () => {
      active = false;
      clearTimeout(timer);
      observer?.disconnect();
      element.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
    };
  }, [ref, state.key, state.count, state.loading, state.error, state.hasMore]);
}
