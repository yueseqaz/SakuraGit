import { useEffect, useRef, useState } from 'react';
import { isMyGo } from 'mygo-runtime';
import { Download, FolderOpen, Plus } from 'lucide-react';
import { Git, type CloneProgress } from './mygo';
import { Dialog } from './Dialog';
import { ErrorDetails, redactGitError } from './ErrorDetails';

export function NewRepositoryDialog({
  busy: parentBusy,
  onClose,
  onCreate,
}: {
  busy: boolean;
  onClose: () => void;
  onCreate: (
    source: string,
    target: string,
    init: boolean,
    existing: boolean,
    branch: string,
    singleBranch: boolean,
    cloneID: string,
  ) => Promise<void>;
}) {
  const [init, setInit] = useState(false);
  const [existing, setExisting] = useState(false);
  const [source, setSource] = useState('');
  const [parent, setParent] = useState('');
  const [folder, setFolder] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const busy = parentBusy || submitting;
  const [cloneID, setCloneID] = useState('');
  const [progress, setProgress] = useState<CloneProgress | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [canceling, setCanceling] = useState(false);
  useEffect(() => {
    if (!cloneID || !submitting || !isMyGo()) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const started = Date.now();
    const poll = async () => {
      try {
        const next = await Git.cloneProgress(cloneID);
        if (active && next.id === cloneID) setProgress(next);
      } catch {
        // Registration may lag the first poll; never invent progress on IPC errors.
      }
      if (active) {
        setElapsed(Math.floor((Date.now() - started) / 1000));
        timer = setTimeout(() => void poll(), 400);
      }
    };
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [cloneID, submitting]);
  const cancelClone = async () => {
    setCanceling(true);
    try {
      await Git.cancelClone(cloneID);
    } catch (e) {
      setError(String(e));
      setCanceling(false);
    }
  };
  const [branches, setBranches] = useState<string[] | null>(null);
  const [defaultBranch, setDefaultBranch] = useState('');
  const [branch, setBranch] = useState('');
  const [branchQuery, setBranchQuery] = useState('');
  const [singleBranch, setSingleBranch] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const discovery = useRef(0);
  useEffect(
    () => () => {
      discovery.current++;
    },
    [],
  );
  const discover = async () => {
    const id = ++discovery.current;
    setDiscovering(true);
    setError('');
    try {
      if (!isMyGo()) throw new Error('浏览器为只读预览，请在桌面应用中读取真实远程分支');
      const result = await Git.remoteBranches(source.trim());
      if (id !== discovery.current) return;
      setBranches(result.branches);
      setDefaultBranch(result.defaultBranch);
      setBranch(result.branches.includes(result.defaultBranch) ? result.defaultBranch : '');
    } catch (e) {
      if (id === discovery.current)
        setError(
          `读取远程分支失败：${e instanceof Error ? e.message : String(e)}；仍可按远程默认分支克隆。`,
        );
    } finally {
      if (id === discovery.current) setDiscovering(false);
    }
  };
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
          if (!busy && !discovering && ((init && existing) || validFolder) && parent.trim()) {
            setError('');
            const id = init ? '' : crypto.randomUUID();
            setCloneID(id);
            setProgress(null);
            setElapsed(0);
            setCanceling(false);
            setSubmitting(true);
            void onCreate(source.trim(), target, init, init && existing, branch, singleBranch, id)
              .catch(async (e) => {
                setError(String(e));
                if (id && isMyGo()) {
                  try {
                    setProgress(await Git.cloneProgress(id));
                  } catch {
                    setProgress(null);
                  }
                }
              })
              .finally(() => setSubmitting(false));
          }
        }}
      >
        <div className="modal-kicker">SAKURAGIT / NEW REPOSITORY</div>
        <h2 id="modal-title">{submitting && !init ? '正在克隆仓库。' : '从这里，开始新项目。'}</h2>
        <div hidden={submitting && !init}>
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
              onClick={() => {
                setInit(true);
                setCloneID('');
              }}
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
                onChange={(e) => {
                  discovery.current++;
                  setDiscovering(false);
                  setSource(e.target.value);
                  setBranches(null);
                  setBranch('');
                  setDefaultBranch('');
                  setBranchQuery('');
                  setError('');
                }}
              />
              <div className="clone-branch-heading">
                <label className="publish-label" htmlFor="clone-branch">
                  检出分支
                </label>
                <button
                  type="button"
                  className="button compact"
                  disabled={busy || discovering || !source.trim()}
                  onClick={() => void discover()}
                >
                  {discovering ? '正在读取…' : '读取远程分支'}
                </button>
              </div>
              {branches && branches.length > 8 && (
                <input
                  className="modal-input"
                  aria-label="筛选远程分支"
                  placeholder="筛选分支名称…"
                  value={branchQuery}
                  disabled={busy}
                  onChange={(e) => setBranchQuery(e.target.value)}
                />
              )}
              <select
                id="clone-branch"
                className="modal-input"
                value={branch}
                disabled={busy || discovering || !branches?.length}
                onChange={(e) => setBranch(e.target.value)}
              >
                <option value="">远程默认分支{defaultBranch ? `（${defaultBranch}）` : ''}</option>
                {branches
                  ?.filter(
                    (name) =>
                      name === branch || name.toLowerCase().includes(branchQuery.toLowerCase()),
                  )
                  .map((name) => (
                    <option key={name} value={name}>
                      {name}
                      {name === defaultBranch ? ' / 默认' : ''}
                    </option>
                  ))}
              </select>
              <p className="clone-branch-hint">
                {branches?.length === 0
                  ? '远程尚无分支，或未公开分支引用。可按默认方式克隆空仓库。'
                  : branches
                    ? `找到 ${branches.length} 个分支。检出分支决定打开后看到的代码。`
                    : '可先读取分支再选择；不读取时使用远程 HEAD 的默认分支。'}
              </p>
              <label className="check-option">
                <input
                  type="checkbox"
                  checked={singleBranch}
                  disabled={busy || discovering}
                  onChange={(e) => setSingleBranch(e.target.checked)}
                />
                只拉取所选分支（不跟踪其他远程分支）
              </label>
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
        </div>
        {submitting && !init && (
          <div className="clone-route">
            <p>{source}</p>
            <span>保存到</span>
            <p>{target}</p>
            <span>
              {branch || '远程默认分支'}
              {singleBranch ? ' / 仅跟踪该分支' : ''}
            </span>
          </div>
        )}
        <div className="safety-callout">
          <span>
            {init && existing
              ? '只添加 Git 元数据，不改动项目文件。已有仓库或仓库内的子目录会被拒绝，不会重新初始化。'
              : '只创建新文件夹，不会覆盖已有目录。克隆失败或取消时保留目标目录供检查。克隆最长等待 30 分钟；读取远程分支最长 90 秒。'}
          </span>
        </div>
        {cloneID && (
          <section className="clone-progress" aria-label="克隆进度" aria-busy={submitting}>
            <div className="clone-progress-heading" role="status">
              <strong>
                {canceling && submitting
                  ? '正在停止克隆…'
                  : progress?.phase || (submitting ? '正在启动克隆…' : '克隆未完成')}
              </strong>
              <span>
                {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
              </span>
            </div>
            <progress
              aria-label="当前阶段进度"
              max={100}
              value={progress && progress.percent >= 0 ? progress.percent : undefined}
            />
            <p>
              {progress?.percent !== undefined && progress.percent >= 0
                ? `当前阶段 ${progress.percent}%`
                : '等待 Git 返回进度'}
            </p>
            {progress?.detail && <pre>{redactGitError(progress.detail)}</pre>}
            {submitting && (
              <button
                type="button"
                className="button compact"
                disabled={!progress || progress.state !== 'running' || canceling}
                onClick={() => void cancelClone()}
              >
                {canceling ? '正在取消…' : '取消克隆'}
              </button>
            )}
          </section>
        )}
        {error && <ErrorDetails message={error} />}
        <div className="modal-buttons">
          <button type="button" className="button" disabled={busy} onClick={onClose}>
            取消
          </button>
          <button
            className="button primary"
            disabled={
              busy ||
              discovering ||
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
