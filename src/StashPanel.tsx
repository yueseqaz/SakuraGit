import { useEffect, useState, type ReactNode } from 'react';
import { isMyGo } from 'mygo-runtime';
import { Archive, ArrowDownToLine, Plus, Trash2 } from 'lucide-react';
import { Git, type Diff, type Snapshot, type Stash } from './mygo';
import { Dialog } from './Dialog';
import { demoDiff } from './demo';
import { ResizableSplit } from './ResizableSplit';
import type { Mutate } from './panel-types';

type Action = { kind: 'save' } | { kind: 'restore' | 'drop'; item: Stash };
export function StashPanel({
  snapshot,
  busy,
  version,
  run,
  renderDiff,
}: {
  snapshot: Snapshot;
  busy: boolean;
  version: number;
  run: Mutate;
  renderDiff: (diff: Diff | null, loading: boolean, error: string, stash?: Stash) => ReactNode;
}) {
  const [selectedHash, setSelectedHash] = useState('');
  const item = snapshot.stashes.find((s) => s.hash === selectedHash) || snapshot.stashes[0];
  const [action, setAction] = useState<Action | null>(null);
  const [message, setMessage] = useState('');
  const [untracked, setUntracked] = useState(true);
  const [restoreIndex, setRestoreIndex] = useState(true);
  const [loaded, setLoaded] = useState<{ key: string; diff: Diff } | null>(null);
  const [error, setError] = useState('');
  const key = `${snapshot.root}:${item?.hash}:${version}`;
  useEffect(() => {
    let active = true;
    setError('');
    if (!item) return;
    (isMyGo()
      ? Git.stashDiff(snapshot.root, item.hash)
      : Promise.resolve(demoDiff('src/components/CommandMenu.tsx'))
    )
      .then((diff) => {
        if (active) setLoaded({ key, diff });
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, [key]);
  const submit = async () => {
    if (!action || busy) return;
    setAction(null);
    if (action.kind === 'save') {
      const ok = await run(
        '创建 Stash',
        (root) => Git.saveStash(root, message.trim(), untracked),
        '已创建 Stash',
      );
      if (ok) {
        setMessage('');
        setSelectedHash('');
      }
    } else if (action.kind === 'restore') {
      await run(
        '应用 Stash',
        (root) => Git.restoreStash(root, action.item.hash, restoreIndex),
        '已应用 Stash，记录仍保留',
      );
    } else
      await run(
        '删除 Stash',
        (root) => Git.dropStash(root, action.item.hash, action.item.ref),
        '所选 Stash 已删除。',
      );
  };
  return (
    <>
      <ResizableSplit
        className="stash-workbench"
        name="stash"
        label="调整 Stash 列表与差异宽度"
        initial={0.34}
        minFirst={230}
        minSecond={300}
      >
        <section className="stash-list-panel" aria-label="Stash 列表">
          <div className="panel-title">
            <span>
              Stash <span className="muted-count">{snapshot.stashes.length}</span>
            </span>
            <button
              className="button compact"
              disabled={
                busy ||
                snapshot.unborn ||
                !!snapshot.state ||
                !snapshot.files.length ||
                snapshot.files.some((f) => f.conflicted)
              }
              onClick={() => setAction({ kind: 'save' })}
            >
              <Plus size={13} />
              创建 Stash
            </button>
          </div>
          <p className="panel-intro">任务切换前，给未完成的工作留一个位置。恢复默认保留原记录。</p>
          <div className="stash-items">
            {snapshot.stashes.map((s) => (
              <button
                key={`${s.ref}:${s.hash}`}
                className={`stash-item ${s.hash === item?.hash ? 'selected' : ''}`}
                aria-pressed={s.hash === item?.hash}
                onClick={() => setSelectedHash(s.hash)}
              >
                <Archive size={16} />
                <span>
                  <strong>{s.subject}</strong>
                  <small>
                    {s.ref} / {new Date(s.date).toLocaleString('zh-CN')}
                  </small>
                </span>
              </button>
            ))}
            {!snapshot.stashes.length && (
              <div className="empty-state">
                <Archive size={28} />
                <strong>还没有Stash</strong>
                <p>工作区有修改时，可以先保存，再切换分支。</p>
              </div>
            )}
          </div>
          {item && (
            <div className="stash-actions">
              <button
                className="button"
                disabled={busy || snapshot.files.length > 0 || !!snapshot.state}
                title="需要干净的工作区"
                onClick={() => setAction({ kind: 'restore', item })}
              >
                <ArrowDownToLine size={14} />
                应用 Stash
              </button>
              <button
                className="button danger-outline"
                disabled={busy}
                onClick={() => setAction({ kind: 'drop', item })}
              >
                <Trash2 size={14} />
                删除
              </button>
              <p>恢复需要干净的工作区。发生冲突时，先检查工作区，不要重复恢复。</p>
            </div>
          )}
        </section>
        {renderDiff(
          loaded?.key === key ? loaded.diff : null,
          !!item && loaded?.key !== key && !error,
          error,
          item,
        )}
      </ResizableSplit>
      {action && (
        <Dialog onClose={() => !busy && setAction(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <div className="modal-kicker">SAKURAGIT / STASH</div>
            <h2 id="modal-title">
              {action.kind === 'save'
                ? '创建 Stash'
                : action.kind === 'restore'
                  ? '应用 Stash'
                  : '删除 Stash？'}
            </h2>
            {action.kind === 'save' ? (
              <>
                <label className="publish-label" htmlFor="stash-message">
                  说明
                </label>
                <input
                  id="stash-message"
                  className="modal-input"
                  required
                  value={message}
                  maxLength={300}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="例如：登录页做到一半，先修线上问题"
                />
                <label className="check-option">
                  <input
                    type="checkbox"
                    checked={untracked}
                    onChange={(e) => setUntracked(e.target.checked)}
                  />
                  包含未跟踪文件（不包含被忽略的文件）
                </label>
                <p className="modal-description">
                  保存后将清理对应工作区修改，暂存状态也会被记录。子模块内部修改不由父仓库 Stash
                  保存。
                </p>
              </>
            ) : (
              <>
                <p className="modal-description">{action.item.subject}</p>
                <code className="target-path">
                  {action.item.ref} / {action.item.hash.slice(0, 12)}
                </code>
                {action.kind === 'restore' ? (
                  <>
                    <label className="check-option">
                      <input
                        type="checkbox"
                        checked={restoreIndex}
                        onChange={(e) => setRestoreIndex(e.target.checked)}
                      />
                      同时恢复原暂存区状态
                    </label>
                    <p className="modal-description">
                      执行 apply，而不是
                      pop。原记录保持不变；如果发生冲突，可能已有部分修改写入工作区，需要检查后处理。
                    </p>
                  </>
                ) : (
                  <div className="safety-callout">
                    <span>
                      删除后没有应用内撤销。确认代码已经恢复、提交，或确实不再需要。请避免同时在其他
                      Git 工具中修改 Stash 列表。
                    </span>
                  </div>
                )}
              </>
            )}
            <div className="modal-buttons">
              <button type="button" className="button" onClick={() => setAction(null)}>
                取消
              </button>
              <button
                className={`button ${action.kind === 'drop' ? 'danger-outline' : 'primary'}`}
                disabled={busy || (action.kind === 'save' && !message.trim())}
              >
                {action.kind === 'save'
                  ? '创建 Stash'
                  : action.kind === 'restore'
                    ? '确认恢复并保留记录'
                    : '确认删除 Stash'}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}
