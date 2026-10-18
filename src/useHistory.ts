import { useEffect, useRef, useState } from 'react';
import { Git, type HistoryPage, type Snapshot } from './mygo';

export function useHistory(snapshot: Snapshot | null, search: string, native: boolean) {
  const query = search.trim();
  const key = JSON.stringify([snapshot?.root, snapshot?.historyRevision, query]);
  const initial = (): HistoryPage => ({
    commits: query ? [] : snapshot?.commits || [],
    hasMore: !query && !!snapshot?.historyHasMore,
    revision: snapshot?.historyRevision || '',
    nextOffset: query ? 0 : snapshot?.commits.length || 0,
  });
  const [state, setState] = useState({ key, page: initial(), loading: false, error: '' });
  const request = useRef(0);
  const loading = useRef(false);
  const latest = useRef(key);
  latest.current = key;
  useEffect(() => {
    const id = ++request.current;
    loading.current = false;
    const page = initial();
    if (!query || !snapshot || !native) {
      if (query && !native) {
        page.commits =
          snapshot?.commits.filter((c) =>
            `${c.subject} ${c.author} ${c.authorEmail} ${c.hash}`
              .toLowerCase()
              .includes(query.toLowerCase()),
          ) || [];
      }
      setState({ key, page, loading: false, error: '' });
      return;
    }
    setState({ key, page, loading: true, error: '' });
    const timer = window.setTimeout(() => {
      loading.current = true;
      Git.history(snapshot.root, query, '', 0)
        .then(
          (result) => {
            if (request.current === id && latest.current === key)
              setState({ key, page: result, loading: false, error: '' });
          },
          (error) => {
            if (request.current === id && latest.current === key)
              setState({ key, page, loading: false, error: String(error) });
          },
        )
        .finally(() => {
          if (request.current === id) loading.current = false;
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      request.current++;
    };
    // Snapshot object updates from working-tree refreshes must not discard older pages.
  }, [key, native]);

  const current = state.key === key ? state : { key, page: initial(), loading: !!query, error: '' };
  const load = async (reset = false) => {
    if (
      !native ||
      !snapshot ||
      loading.current ||
      current.loading ||
      (!reset && (!current.page.hasMore || !!current.error))
    )
      return;
    const id = ++request.current;
    loading.current = true;
    setState({ ...current, loading: true, error: '' });
    try {
      const page = await Git.history(
        snapshot.root,
        query,
        reset ? '' : current.page.revision,
        reset ? 0 : current.page.nextOffset,
      );
      if (request.current !== id || latest.current !== key) return;
      setState({
        key,
        page: {
          ...page,
          commits: reset ? page.commits : [...current.page.commits, ...page.commits],
        },
        loading: false,
        error: '',
      });
    } catch (error) {
      if (request.current === id && latest.current === key)
        setState({ ...current, loading: false, error: String(error) });
    } finally {
      if (request.current === id) loading.current = false;
    }
  };
  return {
    ...current.page,
    loading: current.loading,
    error: current.error,
    loadMore: () => load(),
    reload: () => load(true),
  };
}
