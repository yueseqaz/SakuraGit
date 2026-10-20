import { useEffect, useState } from 'react';
import { isMyGo } from 'mygo-runtime';
import { Git, type Snapshot, type WorkflowInfo } from './mygo';
import { Dialog } from './Dialog';
import { ErrorDetails } from './ErrorDetails';
import type { Mutate } from './panel-types';
type Confirmation = {
  action: string;
  name: string;
  target: string;
  revision: string;
  message: string;
};
export function WorkflowPanel({
  snapshot,
  version,
  busy,
  run,
  onSelectConflict,
}: {
  snapshot: Snapshot;
  version: number;
  busy: boolean;
  run: Mutate;
  onSelectConflict: (path: string) => void;
}) {
  const [info, setInfo] = useState<{ key: string; value: WorkflowInfo } | null>(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [branch, setBranch] = useState('');
  const [remoteBranch, setRemoteBranch] = useState('');
  const [target, setTarget] = useState('');
  const [action, setAction] = useState('rename');
  const [editor, setEditor] = useState(() => {
    try {
      return localStorage.getItem('gitlane.editor') || 'vscode';
    } catch {
      return 'vscode';
    }
  });
  const [file, setFile] = useState('');
  const [fileSearch, setFileSearch] = useState('');
  const [confirm, setConfirm] = useState<Confirmation | null>(null);
  const key = `${snapshot.root}:${version}:${reload}`;
  useEffect(() => {
    let active = true;
    setError('');
    setInfo(null);
    if (!isMyGo()) {
      setError('浏览器只读预览：请在桌面应用中使用真实开发工具。');
      return;
    }
    Git.workflow(snapshot.root).then(
      (value) => {
        if (active) {
          setInfo({ key, value });
          setBranch(value.branches.find((b) => b.current)?.name || '');
        }
      },
      (e) => {
        if (active) setError(String(e));
      },
    );
    return () => {
      active = false;
    };
  }, [key]);
  const current = info?.key === key ? info.value : null;
  const selected = snapshot.files.find((f) => f.path === file);
  const matchingFiles = snapshot.files.filter((f) =>
    f.path.toLowerCase().includes(fileSearch.toLowerCase()),
  );
  const visibleFiles = matchingFiles.slice(0, 200);
  if (selected && !visibleFiles.includes(selected)) visibleFiles.unshift(selected);
  const open = async (path: string, kind: string) => {
    setError('');
    try {
      if (!isMyGo()) throw new Error('请在桌面应用中操作');
      await Git.openDevelopmentPath(snapshot.root, path, kind, editor);
    } catch (e) {
      setError(String(e));
    }
  };
  const ask = (action: string, name = '', target = '', message = '') => {
    if (current) setConfirm({ action, name, target, revision: current.revision, message });
  };
  const execute = async () => {
    if (!confirm) return;
    const chosen = confirm;
    setConfirm(null);
    const ok = await run(
      chosen.message || '开发操作',
      (root) =>
        chosen.action === 'ignore'
          ? Git.ignoreFile(root, chosen.name, chosen.revision)
          : Git.workflowAction(root, chosen.action, chosen.name, chosen.target, chosen.revision),
      chosen.action === 'resolve'
        ? '已标记解决并暂存；工作区文件内容未改动。'
        : '操作完成，已重新读取仓库状态。',
    );
    if (ok) setTarget('');
    setReload((n) => n + 1);
  };
  return (
    <section className="collection-panel workflow-panel">
      <div className="collection-header">
        <strong>开发工具与冲突处理</strong>
        <button className="button compact" disabled={busy} onClick={() => setReload((n) => n + 1)}>
          重新读取
        </button>
      </div>
      <p className="collection-intro">
        所有写操作都需要确认，并校验仓库是否已变化。不会强推、强删分支或自动替你选择冲突一侧。
      </p>
      {error && <ErrorDetails message={error} />}
      {!current && !error && <p>正在读取开发状态…</p>}
      {current && (
        <>
          <article className="workflow-card">
            <h3>
              冲突与进行中的流程 <small>{current.state || '没有进行中的流程'}</small>
            </h3>
            {current.conflicts.map((conflict) => (
              <div className="workflow-file" key={conflict.path}>
                <code>{conflict.path}</code>
                <div>
                  <button
                    className="button compact"
                    onClick={() => onSelectConflict(conflict.path)}
                  >
                    三方合并
                  </button>
                  <button
                    className="button compact"
                    disabled={busy}
                    onClick={() => void open(conflict.path, 'editor')}
                  >
                    编辑文件
                  </button>
                  <button
                    className="button compact"
                    disabled={busy}
                    onClick={() =>
                      ask(
                        'mergetool',
                        conflict.path,
                        '',
                        '调用已配置的外部合并工具；会执行 merge.tool / mergetool 配置，请仅对可信仓库使用',
                      )
                    }
                  >
                    合并工具
                  </button>
                  <button
                    className="button compact"
                    disabled={busy}
                    onClick={() =>
                      ask(
                        'resolve',
                        conflict.path,
                        '',
                        '确认此文件已解决并暂存（删除的文件将按删除解决）',
                      )
                    }
                  >
                    标记已解决
                  </button>
                </div>
              </div>
            ))}
            {!current.conflicts.length && <p>没有未解决的冲突文件。</p>}
            {['merge', 'rebase', 'cherry-pick', 'revert'].includes(current.state) && (
              <div className="workflow-actions">
                <button
                  className="button"
                  disabled={busy || !!current.conflicts.length}
                  onClick={() =>
                    ask('continue', '', '', '继续当前 Git 流程（保留 hooks 与提交签名检查）')
                  }
                >
                  继续流程
                </button>
                <button
                  className="button"
                  disabled={busy}
                  onClick={() =>
                    ask(
                      'abort',
                      '',
                      '',
                      '中止当前流程；可能丢弃本次冲突解决中的修改，请先备份需要保留的内容',
                    )
                  }
                >
                  中止流程…
                </button>
              </div>
            )}
          </article>
          <article className="workflow-card">
            <h3>分支管理</h3>
            <label className="publish-label" htmlFor="manage-branch">
              本地分支
            </label>
            <select
              className="modal-input"
              id="manage-branch"
              value={branch}
              disabled={busy}
              onChange={(e) => setBranch(e.target.value)}
            >
              {current.branches
                .filter((b) => !b.remote)
                .map((b) => (
                  <option key={b.name}>{b.name}</option>
                ))}
            </select>
            <label className="publish-label" htmlFor="branch-action">
              操作
            </label>
            <select
              className="modal-input"
              id="branch-action"
              disabled={busy}
              value={action}
              onChange={(e) => {
                setAction(e.target.value);
                setTarget('');
              }}
            >
              <option value="rename">重命名所选本地分支</option>
              <option value="delete">安全删除已合并分支</option>
              <option value="track">设置上游跟踪</option>
              <option value="merge">将所选分支合并到当前分支</option>
              <option value="checkout-remote">检出远程分支为新本地分支</option>
            </select>
            {(action === 'track' || action === 'checkout-remote') && (
              <>
                <label className="publish-label" htmlFor="remote-branch">
                  已有远程分支（不会自动 Fetch）
                </label>
                <select
                  className="modal-input"
                  id="remote-branch"
                  value={action === 'track' ? target : remoteBranch}
                  disabled={busy}
                  onChange={(e) =>
                    action === 'track' ? setTarget(e.target.value) : setRemoteBranch(e.target.value)
                  }
                >
                  <option value="">选择远程分支</option>
                  {current.branches
                    .filter((b) => b.remote)
                    .map((b) => (
                      <option key={b.name}>{b.name}</option>
                    ))}
                </select>
              </>
            )}
            {(action === 'rename' || action === 'checkout-remote') && (
              <>
                <label className="publish-label" htmlFor="branch-new-name">
                  新本地分支名称
                </label>
                <input
                  className="modal-input"
                  id="branch-new-name"
                  value={target}
                  disabled={busy}
                  onChange={(e) => setTarget(e.target.value)}
                />
              </>
            )}
            <button
              className="button"
              disabled={
                busy ||
                !(action === 'checkout-remote' ? remoteBranch : branch) ||
                (['rename', 'track', 'checkout-remote'].includes(action) && !target.trim())
              }
              onClick={() =>
                ask(
                  action,
                  action === 'checkout-remote' ? remoteBranch : branch,
                  target.trim(),
                  action === 'merge'
                    ? `将 ${branch} 合并到当前分支；冲突时会停下等待你处理`
                    : `确认执行 ${action === 'rename' ? '重命名' : action === 'delete' ? '安全删除' : action === 'track' ? '设置跟踪' : '远程分支检出'}：${action === 'checkout-remote' ? remoteBranch : branch}${target ? ` → ${target}` : ''}`,
                )
              }
            >
              检查并确认…
            </button>
          </article>
          <article className="workflow-card">
            <h3>编辑器与本机工具</h3>
            <label className="publish-label" htmlFor="preferred-editor">
              编辑器（需要已安装）
            </label>
            <select
              className="modal-input"
              id="preferred-editor"
              value={editor}
              onChange={(e) => {
                setEditor(e.target.value);
                try {
                  localStorage.setItem('gitlane.editor', e.target.value);
                } catch {}
              }}
            >
              <option value="vscode">Visual Studio Code</option>
              <option value="cursor">Cursor</option>
              <option value="zed">Zed</option>
              <option value="textedit">TextEdit · macOS</option>
            </select>
            <div className="workflow-actions">
              <button className="button" onClick={() => void open('', 'editor')}>
                打开项目
              </button>
              <button className="button" onClick={() => void open('', 'terminal')}>
                内置终端
              </button>
              <button className="button" onClick={() => void open('', 'folder')}>
                打开目录
              </button>
              <button className="button" onClick={() => void open('', 'copy')}>
                复制仓库路径
              </button>
            </div>
            <label className="publish-label" htmlFor="development-file">
              工作区文件
            </label>
            <input
              className="modal-input"
              aria-label="筛选工作区文件"
              placeholder="按路径筛选文件…"
              value={fileSearch}
              onChange={(e) => setFileSearch(e.target.value)}
            />
            {matchingFiles.length > 200 && (
              <p>匹配 {matchingFiles.length} 个文件，仅显示前 200 个，请缩小筛选范围。</p>
            )}
            <select
              className="modal-input"
              id="development-file"
              value={file}
              onChange={(e) => setFile(e.target.value)}
            >
              <option value="">选择变更文件</option>
              {visibleFiles.map((f) => (
                <option key={f.path}>{f.path}</option>
              ))}
            </select>
            <div className="workflow-actions">
              <button
                className="button"
                disabled={!file || busy}
                onClick={() => void open(file, 'editor')}
              >
                编辑文件
              </button>
              <button
                className="button"
                disabled={!file || busy}
                onClick={() => void open(file, 'reveal')}
              >
                在文件夹显示
              </button>
              <button
                className="button"
                disabled={!file || busy}
                onClick={() => void open(file, 'copy')}
              >
                复制文件路径
              </button>
              <button
                className="button"
                disabled={!selected?.untracked || busy}
                onClick={() =>
                  ask(
                    'ignore',
                    file,
                    '',
                    `把 ${file} 的精确路径加入 .gitignore；不会删除文件，也不自动暂存 .gitignore`,
                  )
                }
              >
                加入 .gitignore…
              </button>
            </div>
          </article>
          {(current.submodules || current.lfs) && (
            <p className="safety-callout">
              检测到{current.submodules ? '子模块 ' : ''}
              {current.lfs ? 'Git LFS' : ''}。此版不自动更新子模块或管理 LFS
              锁；请在终端检查工具安装、权限与下载结果。
            </p>
          )}
        </>
      )}
      {confirm && (
        <Dialog onClose={() => !busy && setConfirm(null)}>
          <h2 id="modal-title">确认开发操作</h2>
          <p className="modal-description">{confirm.message}</p>
          <p className="safety-callout">
            操作失败不一定意味着仓库未改变。中止流程尤其可能丢弃过程中的编辑；不会自动替你重试。
          </p>
          <div className="modal-buttons">
            <button className="button" onClick={() => setConfirm(null)}>
              取消
            </button>
            <button className="button primary" disabled={busy} onClick={() => void execute()}>
              确认执行
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
