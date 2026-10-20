import { useEffect, useState } from 'react';
import { isMyGo } from 'mygo-runtime';
import { ArchiveRestore, RotateCcw } from 'lucide-react';
import { Git, type Snapshot, type WorkflowInfo } from './mygo';
import { Workbench, type FileBackup } from './workbench-api';
import { ErrorDetails } from './ErrorDetails';
import { Dialog } from './Dialog';
import type { Mutate } from './panel-types';

export function RecoveryPanel({
  snapshot,
  version,
  busy,
  run,
}: {
  snapshot: Snapshot;
  version: number;
  busy: boolean;
  run: Mutate;
}) {
  const [loaded, setLoaded] = useState<{
    key: string;
    workflow: WorkflowInfo;
    backups: FileBackup[];
  } | null>(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [confirm, setConfirm] = useState<{
    action: string;
    path: string;
    title: string;
    detail: string;
    revision: string;
  } | null>(null);
  const [file, setFile] = useState('');
  const key = `${snapshot.root}:${version}:${reload}`;
  const info = loaded?.key === key ? loaded : null;
  useEffect(() => {
    let active = true;
    setError('');
    if (!isMyGo()) return;
    Promise.all([Git.workflow(snapshot.root), Workbench.fileBackups(snapshot.root)]).then(
      ([workflow, backups]) => {
        if (active) setLoaded({ key, workflow, backups });
      },
      (e) => {
        if (active) setError(String(e));
      },
    );
    return () => {
      active = false;
    };
  }, [key]);
  const ask = (action: string, path: string, title: string, detail: string) => {
    if (info) setConfirm({ action, path, title, detail, revision: info.workflow.revision });
  };
  const execute = async () => {
    if (!confirm) return;
    const chosen = confirm;
    setConfirm(null);
    await run(
      chosen.title,
      (root) => Workbench.recoveryAction(root, chosen.action, chosen.path, chosen.revision),
      '恢复操作完成。请检查工作区和暂存区。',
    );
    setReload((n) => n + 1);
  };
  return (
    <section className="collection-panel recovery-panel">
      <div className="collection-header">
        <strong>
          <ArchiveRestore size={17} /> 撤销与文件备份
        </strong>
        <button className="button compact" disabled={busy} onClick={() => setReload((n) => n + 1)}>
          重新读取
        </button>
      </div>
      <p className="collection-intro">
        撤销提交、恢复文件与丢弃修改是不同的操作。这里不提供 Hard
        Reset，不删除未跟踪文件，也不自动改写远程历史。
      </p>
      {error && <ErrorDetails message={error} />}
      {!isMyGo() && (
        <p className="collection-intro">浏览器仅供只读预览；真实恢复操作在桌面应用中提供。</p>
      )}
      <article className="workflow-card">
        <h3>
          <RotateCcw size={16} /> 撤销末次本地提交
        </h3>
        <p>
          只移动当前分支回到父提交，工作区与暂存区保持原样。仅支持普通末次提交，拒绝本地已知远程引用包含的提交；远程状态以最近一次
          Fetch 为准。
        </p>
        <button
          className="button"
          disabled={busy || !info || snapshot.detached || snapshot.unborn || !!snapshot.state}
          onClick={() =>
            ask(
              'undo-commit',
              '',
              '撤销末次提交',
              '执行 Soft Reset：末次提交的修改仍留在暂存区，现有文件不会被重写。此操作会改写本地分支历史；请先 Fetch 核对是否已推送。',
            )
          }
        >
          撤销末次提交…
        </button>
      </article>
      <article className="workflow-card">
        <h3>将工作文件恢复到暂存区版本</h3>
        <p>
          仅撤销未暂存的文本修改，已暂存内容不动。执行前会备份当前文件；不处理删除、重命名、二进制或未跟踪文件。
        </p>
        <select
          className="modal-input"
          aria-label="要恢复的工作文件"
          value={file}
          onChange={(e) => setFile(e.target.value)}
        >
          <option value="">选择修改文件</option>
          {snapshot.files
            .filter((f) => !f.conflicted && !f.untracked && !f.oldPath && f.worktree === 'M')
            .map((f) => (
              <option key={f.path}>{f.path}</option>
            ))}
        </select>
        <button
          className="button"
          disabled={busy || !info || !file || !!snapshot.state}
          onClick={() =>
            ask(
              'discard-file',
              file,
              '备份并恢复工作文件',
              '当前未暂存修改会先备份，再恢复为暂存区版本。仅影响这个工作文件，不修改暂存区。',
            )
          }
        >
          备份并恢复文件…
        </button>
      </article>
      <article className="workflow-card">
        <h3>
          本仓库的文件备份 <small>{info?.backups.length || 0}</small>
        </h3>
        <p>
          只保存内置合并和恢复操作覆盖前的文件，不是操作记录。保存在本工作树的 Git
          元数据中，不上传、不自动删除。
        </p>
        {info?.backups.map((backup) => (
          <div className="backup-row" key={backup.id}>
            <span>
              <code>{backup.path}</code>
              <small>{new Date(backup.createdAt).toLocaleString('zh-CN')}</small>
            </span>
            <button
              className="button compact"
              disabled={busy || !!snapshot.state}
              onClick={() =>
                ask(
                  'restore-backup',
                  backup.id,
                  '恢复文件备份',
                  `将 ${backup.path} 的备份写回工作区；暂存区不变。覆盖前的内容会另存备份。`,
                )
              }
            >
              恢复到工作区…
            </button>
          </div>
        ))}
        {info && !info.backups.length && <p>还没有文件备份。</p>}
      </article>
      {confirm && (
        <Dialog onClose={() => !busy && setConfirm(null)}>
          <h2 id="modal-title">{confirm.title}？</h2>
          <p className="modal-description">{confirm.detail}</p>
          {confirm.path && <code className="confirmation-path">{confirm.path}</code>}
          <div className="modal-actions">
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
