import { useMemo, type ReactNode } from 'react';
import { GitBranch, GitCommitHorizontal, LoaderCircle, RefreshCw } from 'lucide-react';
import type { Commit } from './mygo';
import type { Selection } from './DiffPanel';
import { buildGraph } from './git-view';
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
  const graphWidth = graph.reduce((width, row) => Math.max(width, 40 + row.lane * 18), 56);
  return (
    <section
      className="history-panel"
      aria-label="提交列表"
      data-loaded-count={commits.length}
      data-has-more={hasMore}
      data-loading={loading}
    >
      <div className="panel-title">
        <span>
          提交历史 <span className="muted-count">{commits.length}</span>
        </span>
        <button
          type="button"
          className="icon-button"
          aria-label="刷新提交历史"
          disabled={loading}
          onClick={onReload}
        >
          <RefreshCw size={14} />
        </button>
      </div>
      <div className="history-caption">
        <GitBranch size={13} />
        {search ? '搜索全部提交' : '全部分支'}
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
                <svg
                  className="commit-graph"
                  width={graphWidth}
                  height={84}
                  viewBox={`0 0 ${graphWidth} 66`}
                  preserveAspectRatio="none"
                  aria-hidden="true"
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
              )}
              <span className="commit-info">
                <strong>{commit.subject}</strong>
                <span className="commit-meta">
                  <span className="commit-author" title={commit.authorEmail}>
                    <span className="author-avatar small">
                      {commit.author.slice(0, 2).toUpperCase()}
                    </span>
                    <b>{commit.author}</b>
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
            title={search ? '没有匹配的提交' : '故事正要开始'}
            text={search ? '未找到匹配的提交' : '暂无提交'}
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
    </section>
  );
}

function EmptyState({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="empty-state">
      <span className="empty-icon">{icon}</span>
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}
