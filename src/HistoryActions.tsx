import { useState } from 'react';
import { isMyGo } from 'mygo-runtime';
import { Git, type Commit, type Snapshot } from './mygo';
import { Workbench } from './workbench-api';
import { Dialog } from './Dialog';
import { ErrorDetails } from './ErrorDetails';
import type { Mutate } from './panel-types';

export function HistoryActions({
  snapshot,
  commit,
  busy,
  run,
}: {
  snapshot: Snapshot;
  commit?: Commit;
  busy: boolean;
  run: Mutate;
}) {
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<{
    action: string;
    root: string;
    hash: string;
    subject: string;
    branch: string;
    revision: string;
  } | null>(null);
  const ask = async (action: string) => {
    if (!commit || checking) return;
    setChecking(true);
    setError('');
    const chosen = {
      action,
      root: snapshot.root,
      hash: commit.hash,
      subject: commit.subject,
      branch: snapshot.branch,
    };
    try {
      const info = await Git.workflow(chosen.root);
      setConfirm({ ...chosen, revision: info.revision });
    } catch (e) {
      setError(String(e));
    } finally {
      setChecking(false);
    }
  };
  return (
    <div className="history-actions">
      <button
        className="button compact"
        disabled={!isMyGo() || busy || checking || !commit || commit.parents.length > 1}
        onClick={() => void ask('cherry-pick')}
      >
        Cherry-pick…
      </button>
      <button
        className="button compact"
        disabled={!isMyGo() || busy || checking || !commit || commit.parents.length > 1}
        onClick={() => void ask('revert')}
      >
        Revert…
      </button>
      {error && <ErrorDetails message={error} />}
      {confirm && (
        <Dialog onClose={() => !busy && setConfirm(null)}>
          <h2 id="modal-title">
            {confirm.action === 'revert' ? '创建反向提交' : '拣选提交到当前分支'}？
          </h2>
          <p className="modal-description">
            {confirm.action === 'revert'
              ? '保留原始历史，创建一个撤销所选修改的新提交。'
              : '将所选提交的修改应用到当前分支，产生新的提交。'}
            要求工作区干净；遇到冲突会停下，不自动跳过 Hooks 或签名检查。
          </p>
          <div className="history-action-target">
            <strong>{confirm.subject}</strong>
            <code>{confirm.hash}</code>
            <span>目标分支：{confirm.branch}</span>
          </div>
          <div className="modal-actions">
            <button className="button" onClick={() => setConfirm(null)}>
              取消
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={() => {
                const chosen = confirm;
                setConfirm(null);
                void run(
                  chosen.action,
                  (root) => {
                    if (root !== chosen.root) throw new Error('仓库已切换，请重新确认');
                    return Workbench.historyAction(
                      root,
                      chosen.action,
                      chosen.hash,
                      chosen.revision,
                    );
                  },
                  '历史操作完成，已刷新当前分支。',
                );
              }}
            >
              确认执行
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
