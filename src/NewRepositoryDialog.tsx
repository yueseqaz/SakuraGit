import { useState } from 'react';
import { isMyGo } from 'mygo-runtime';
import { Download, FolderOpen, Plus } from 'lucide-react';
import { Git } from './mygo';
import { Dialog } from './Dialog';

export function NewRepositoryDialog({
  busy,
  onClose,
  onCreate,
}: {
  busy: boolean;
  onClose: () => void;
  onCreate: (source: string, target: string, init: boolean, existing: boolean) => Promise<void>;
}) {
  const [init, setInit] = useState(false);
  const [existing, setExisting] = useState(false);
  const [source, setSource] = useState('');
  const [parent, setParent] = useState('');
  const [folder, setFolder] = useState('');
  const [error, setError] = useState('');
  const validFolder =
    !!folder.trim() &&
    !['.', '..'].includes(folder.trim()) &&
    !/[\\/\x00-\x1f]/.test(folder) &&
    folder.length < 128;
  const target =
    init && existing ? parent.trim() : `${parent.replace(/[\\/]+$/, '')}/${folder.trim()}`;
  const browse = async () => {
    try {
      const selected = await Git.chooseParent();
      if (selected) setParent(selected);
    } catch (e) {
      setError(String(e));
    }
  };
  return (
    <Dialog
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy && ((init && existing) || validFolder) && parent.trim())
            void onCreate(source.trim(), target, init, init && existing);
        }}
      >
        <div className="modal-kicker">GITLANE / NEW REPOSITORY</div>
        <h2 id="modal-title">从这里，开始新项目。</h2>
        <div className="appearance-options new-repo-tabs">
          <button
            type="button"
            className={`button ${!init ? 'selected' : ''}`}
            disabled={busy}
            aria-pressed={!init}
            onClick={() => setInit(false)}
          >
            <Download size={15} />
            克隆仓库
          </button>
          <button
            type="button"
            className={`button ${init ? 'selected' : ''}`}
            disabled={busy}
            aria-pressed={init}
            onClick={() => setInit(true)}
          >
            <Plus size={15} />
            初始化仓库
          </button>
        </div>
        <p className="modal-description">
          {init
            ? '使用 main 分支开始。可以新建空目录，也可以为已有项目添加 Git 版本管理。'
            : '支持 HTTPS、SSH 或本机仓库路径。使用系统 Git 凭据，不在软件里保存密码或 Token。'}
        </p>
        {!init && (
          <>
            <label className="publish-label" htmlFor="clone-url">
              仓库地址
            </label>
            <input
              autoComplete="off"
              id="clone-url"
              className="modal-input"
              placeholder="https://example.com/team/project.git"
              value={source}
              required
              disabled={busy}
              onChange={(e) => setSource(e.target.value)}
            />
          </>
        )}
        {init && (
          <label className="check-option">
            <input
              type="checkbox"
              checked={existing}
              disabled={busy}
              onChange={(e) => setExisting(e.target.checked)}
            />
            在已有项目文件夹中初始化
          </label>
        )}
        <label className="publish-label" htmlFor="repo-parent">
          {init && existing ? '已有项目目录' : '保存到父文件夹'}
        </label>
        <div className="path-input">
          <input
            id="repo-parent"
            className="modal-input"
            placeholder="/Users/you/Code"
            value={parent}
            required
            disabled={busy}
            onChange={(e) => setParent(e.target.value)}
          />
          <button
            type="button"
            className="button"
            disabled={busy || !isMyGo()}
            onClick={() => void browse()}
            aria-label={init && existing ? '选择项目文件夹' : '选择父文件夹'}
          >
            <FolderOpen size={16} />
          </button>
        </div>
        {!(init && existing) && (
          <>
            <label className="publish-label" htmlFor="repo-folder">
              新文件夹名称
            </label>
            <input
              id="repo-folder"
              className="modal-input"
              placeholder="my-project"
              value={folder}
              required
              disabled={busy}
              onChange={(e) => setFolder(e.target.value)}
            />
          </>
        )}
        {parent && ((init && existing) || folder) && <p className="target-path">{target}</p>}
        <div className="safety-callout">
          <span>
            {init && existing
              ? '只添加 Git 元数据，不改动项目文件。已有仓库或仓库内的子目录会被拒绝，不会重新初始化。'
              : '只创建新文件夹，不会覆盖已有目录。克隆失败时保留目标目录供检查，不自动清理。网络操作最长等待 90 秒。'}
          </span>
        </div>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="modal-buttons">
          <button type="button" className="button" disabled={busy} onClick={onClose}>
            取消
          </button>
          <button
            className="button primary"
            disabled={
              busy ||
              (!(init && existing) && !validFolder) ||
              !parent.trim() ||
              (!init && !source.trim())
            }
          >
            {busy ? '正在处理…' : init ? (existing ? '初始化并打开' : '创建仓库') : '克隆并打开'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
