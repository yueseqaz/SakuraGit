import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  GitBranch,
  GitCommitHorizontal,
  LoaderCircle,
  Maximize2,
  Minimize2,
  RefreshCw,
} from 'lucide-react';
import type { Commit } from './mygo';
import type { Selection } from './DiffPanel';
import { buildGraph, graphContentWidth } from './git-view';
import { useVirtualRows } from './useVirtualRows';
import { useAutoLoadMore } from './useAutoLoadMore';
const formatDate = (date: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));

export function HistoryPanel({
  scope,
  commits,
  loading,
  error,
  hasMore,
  onLoadMore,
  onReload,
  selection,
  search,
  onSelect,
  expanded = false,
  onToggleExpanded,
}: {
  scope: string;
  commits: Commit[];
  loading: boolean;
  error: string;
  hasMore: boolean;
  onLoadMore: () => void;
  onReload: () => void;
  selection: Selection;
  search: string;
  onSelect: (selection: Selection) => void;
  expanded?: boolean;
  onToggleExpanded?: () => void;
}) {
  const graph = useMemo(() => buildGraph(commits), [commits]);
  const rows = commits.map((commit, i) => ({ commit, graph: graph[i] }));
  const selectedIndex =
    selection?.kind === 'commit'
      ? commits.findIndex((commit) => commit.hash === selection.hash)
      : -1;
  const windowed = useVirtualRows(
    rows.length,
    84,
    300,
    JSON.stringify([scope, search]),
    selectedIndex,
  );
  useAutoLoadMore(windowed.ref, {
    key: JSON.stringify([scope, search]),
    count: commits.length,
    loading,
    error,
    hasMore,
    loadMore: onLoadMore,
  });
  const graphWidth = graphContentWidth(graph);
  const graphScroll = useRef<HTMLDivElement>(null);
  const [graphViewport, setGraphViewport] = useState(56);
  const [graphOffset, setGraphOffset] = useState(0);
  const graphOverflows = !search && graphWidth > graphViewport;
  const selectedLane = selectedIndex >= 0 ? graph[selectedIndex]?.lane : undefined;
  useEffect(() => {
    const list = windowed.ref.current;
    if (!list) return;
    const resize = () =>
      setGraphViewport(
        Math.min(
          graphWidth,
          Math.max(56, expanded ? list.clientWidth - 320 : Math.floor(list.clientWidth * 0.36)),
        ),
      );
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
    observer?.observe(list);
    resize();
    return () => observer?.disconnect();
  }, [expanded, graphWidth, windowed.ref]);
  useEffect(() => {
    if (graphScroll.current) graphScroll.current.scrollLeft = 0;
    setGraphOffset(0);
  }, [scope, search]);
  useEffect(() => {
    const scroll = graphScroll.current;
    if (!scroll) return;
    const maxOffset = Math.max(0, graphWidth - graphViewport);
    let offset = Math.min(scroll.scrollLeft, maxOffset);
    if (selectedLane !== undefined) {
      const x = 20 + selectedLane * 18;
      if (x < offset + 10) offset = Math.max(0, x - 10);
      else if (x > offset + graphViewport - 10)
        offset = Math.min(maxOffset, x - graphViewport + 10);
    }
    scroll.scrollLeft = offset;
    setGraphOffset(offset);
  }, [scope, search, selectedLane, selectedIndex, graphWidth, graphViewport]);
  const scrollGraph = (delta: number) => {
    const scroll = graphScroll.current;
    if (!scroll) return;
    scroll.scrollLeft += delta;
    setGraphOffset(scroll.scrollLeft);
  };
  return (
    <section
      className="history-panel"
      aria-label="提交列表"
      data-loaded-count={commits.length}
      data-has-more={hasMore}
      data-loading={loading}
      style={{ '--history-graph-viewport': `${graphViewport}px` } as CSSProperties}
    >
      <div className="panel-title">
        <span>
          提交历史 <span className="muted-count">{commits.length}</span>
        </span>
        <span className="history-panel-actions">
          {onToggleExpanded && (
            <button
              type="button"
              className="icon-button"
              aria-label={expanded ? '恢复分栏视图' : '展开提交列表'}
              title={expanded ? '恢复分栏视图' : '展开提交列表'}
              aria-pressed={expanded}
              onClick={onToggleExpanded}
            >
              {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
          )}
          <button
            type="button"
            className="icon-button"
            aria-label="刷新提交历史"
            disabled={loading}
            onClick={onReload}
          >
            <RefreshCw size={14} />
          </button>
        </span>
      </div>
      <div className="history-caption">
        <GitBranch size={13} />
        {search ? '搜索全部提交' : '全部分支'}
        {graphOverflows && (
          <span className="history-graph-navigation">
            <button
              type="button"
              className="icon-button"
              aria-label="向左滚动图谱"
              disabled={graphOffset <= 0}
              onClick={() => scrollGraph(-graphViewport * 0.75)}
            >
              <ChevronLeft size={14} />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="向右滚动图谱"
              disabled={graphOffset >= graphWidth - graphViewport - 1}
              onClick={() => scrollGraph(graphViewport * 0.75)}
            >
              <ChevronRight size={14} />
            </button>
          </span>
        )}
      </div>
      <div className="commit-list" ref={windowed.ref}>
        {!!windowed.before && <div style={{ height: windowed.before }} aria-hidden="true" />}
        {rows.length ? (
          rows.slice(windowed.start, windowed.end).map(({ commit, graph: row }) => (
            <button
              className={`commit-row ${selection?.kind === 'commit' && selection.hash === commit.hash ? 'selected' : ''}`}
              key={commit.hash}
              aria-pressed={selection?.kind === 'commit' && selection.hash === commit.hash}
              onClick={() => onSelect({ kind: 'commit', hash: commit.hash })}
            >
              {!search && (
                <span
                  className="commit-graph-viewport"
                  onWheel={(event) => {
                    if (graphOverflows && (event.deltaX || event.shiftKey)) {
                      scrollGraph(event.deltaX || event.deltaY);
                    }
                  }}
                >
                  <svg
                    className="commit-graph"
                    width={graphWidth}
                    height={84}
                    viewBox={`0 0 ${graphWidth} 66`}
                    preserveAspectRatio="none"
                    aria-hidden="true"
                    style={{ transform: `translateX(${-graphOffset}px)` }}
                  >
                    {row.paths.map((path, i) => (
                      <path d={path.d} stroke={path.color} strokeWidth="2" fill="none" key={i} />
                    ))}
                    <circle
                      cx={20 + row.lane * 18}
                      cy="33"
                      r="5"
                      fill="var(--panel)"
                      stroke={row.color}
                      strokeWidth="2.5"
                    />
                  </svg>
                </span>
              )}
              <span className="commit-info">
                <strong title={commit.subject}>{commit.subject}</strong>
                <span className="commit-meta">
                  <span className="commit-author" title={commit.authorEmail}>
                    <span className="author-avatar small">
                      {commit.author.slice(0, 2).toUpperCase()}
                    </span>
                    <b title={commit.author}>{commit.author}</b>
                  </span>

                  <time>{formatDate(commit.date)}</time>
                  <code>{commit.short}</code>
                </span>
                {commit.refs && (
                  <span className="commit-refs">
                    {commit.refs.split(', ').map((ref) => (
                      <span className={ref.startsWith('HEAD') ? 'head-ref' : ''} key={ref}>
                        <GitBranch size={10} />
                        {ref.replace('HEAD -> ', '')}
                      </span>
                    ))}
                  </span>
                )}
              </span>
            </button>
          ))
        ) : !loading && !error ? (
          <EmptyState
            icon={<GitCommitHorizontal size={27} />}
            title={search ? '未找到匹配的提交' : '暂无提交'}
            text=""
          />
        ) : null}
        {!!windowed.after && <div style={{ height: windowed.after }} aria-hidden="true" />}
        <div className="history-pagination" aria-live="polite">
          {error ? (
            <>
              <p role="alert">{error}</p>
              <button className="button" onClick={onReload}>
                重新加载历史
              </button>
            </>
          ) : loading ? (
            <span>
              <LoaderCircle size={15} className="spin" />
              {search ? '正在搜索仓库历史…' : '正在读取更多提交…'}
            </span>
          ) : hasMore ? (
            <div className="history-auto-hint">
              <span>继续向下滚动，自动加载更早的{search ? '匹配' : ''}提交</span>
              <button className="button compact" onClick={onLoadMore}>
                立即加载
              </button>
            </div>
          ) : commits.length > 0 ? (
            <span>
              已到{search ? '搜索结果' : '历史'}末尾 / 共 {commits.length} 条
            </span>
          ) : null}
        </div>
      </div>
      {!search && (
        <div className="history-graph-scroll-track" hidden={!graphOverflows}>
          <div
            className="history-graph-scroll"
            ref={graphScroll}
            role="region"
            aria-label="提交图谱水平滚动"
            tabIndex={0}
            onScroll={(event) => setGraphOffset(event.currentTarget.scrollLeft)}
          >
            <div style={{ width: graphWidth, height: 1 }} />
          </div>
        </div>
      )}
    </section>
  );
}

function EmptyState({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="empty-state">
      <span className="empty-icon">{icon}</span>
      <strong>{title}</strong>
      {text && <p>{text}</p>}
    </div>
  );
}
