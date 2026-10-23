import { useEffect, useState, type ReactNode } from 'react';
import { isMyGo } from 'mygo-runtime';
import { Copy, FileText, LoaderCircle } from 'lucide-react';
import { Git, type Commit, type CommitDetails, type Diff } from './mygo';
import { ResizableSplit } from './ResizableSplit';
import { demoDiff } from './demo';

const native = isMyGo();
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
export function HistoryDetails({
  root,
  commit,
  version,
  renderDiff,
  actions,
}: {
  root: string;
  commit?: Commit;
  version: number;
  renderDiff: (diff: Diff | null, loading: boolean, error: string) => ReactNode;
  actions?: ReactNode;
}) {
  const [loaded, setLoaded] = useState<{ key: string; value: CommitDetails } | null>(null);
  const [error, setError] = useState('');
  const [path, setPath] = useState('');
  const [patch, setPatch] = useState<{ key: string; value: Diff } | null>(null);
  const [patchError, setPatchError] = useState('');
  const [copiedHash, setCopiedHash] = useState('');
  const [copyError, setCopyError] = useState('');
  const key = `${root}:${commit?.hash}:${version}`;
  const details = loaded?.key === key ? loaded.value : null;
  useEffect(() => {
    let active = true;
    setError('');
    setPath('');
    setCopiedHash('');
    setCopyError('');
    if (!commit) return;
    const request: Promise<CommitDetails> = native
      ? Git.commitDetails(root, commit.hash)
      : Promise.resolve({
          commit,
          body: 'Add a focused command menu with keyboard-first navigation.\n\nKeep search fast and the workspace easy to navigate.',
          committer: commit.author,
          committerEmail: commit.authorEmail,
          committedAt: commit.date,
          files: [
            {
              path: 'src/components/CommandMenu.tsx',
              oldPath: '',
              status: 'A',
              additions: 34,
              deletions: 0,
              binary: false,
            },
            {
              path: 'src/styles/command-menu.css',
              oldPath: '',
              status: 'M',
              additions: 18,
              deletions: 4,
              binary: false,
            },
          ],
        });
    request
      .then((value) => {
        if (active) {
          setLoaded({ key, value });
          setPath(value.files[0]?.path || '');
        }
      })
      .catch((e) => {
        if (active) setError(message(e));
      });
    return () => {
      active = false;
    };
  }, [key]);
  const patchKey = `${key}:${path}`;
  useEffect(() => {
    let active = true;
    setPatchError('');
    if (!details || !path || !commit) return;
    (native ? Git.commitFileDiff(root, commit.hash, path) : Promise.resolve(demoDiff(path)))
      .then((value) => {
        if (active) setPatch({ key: patchKey, value });
      })
      .catch((e) => {
        if (active) setPatchError(message(e));
      });
    return () => {
      active = false;
    };
  }, [patchKey, details]);
  const copy = async () => {
    if (!commit) return;
    setCopyError('');
    try {
      if (native) await Git.copyText(commit.hash);
      else await navigator.clipboard.writeText(commit.hash);
      setCopiedHash(commit.hash);
    } catch (e) {
      setCopyError(`无法复制：${message(e)}`);
    }
  };
  if (!commit)
    return (
      <section className="commit-details">
        <div className="empty-state">选择一条提交，查看作者与变更文件。</div>
      </section>
    );
  if (error)
    return (
      <section className="commit-details">
        <p role="alert" className="details-error">
          {error}
        </p>
      </section>
    );
  if (!details)
    return (
      <section className="commit-details">
        <div className="empty-state">
          <LoaderCircle className="spin" />
          正在读取提交详情…
        </div>
      </section>
    );
  const c = details.commit;
  return (
    <section className="commit-details" aria-label="提交详情">
      <ResizableSplit
        className="commit-details-body"
        name="commit-details"
        label="调整提交信息与差异高度"
        axis="vertical"
        initial={0.43}
        minFirst={120}
        minSecond={160}
      >
        <div className="commit-overview">
          <div className="commit-summary">
            <div className="detail-eyebrow">
              COMMIT / {c.short}
              <button className="button compact" onClick={() => void copy()}>
                <Copy size={12} />
                {copiedHash === commit.hash ? '已复制' : '复制 ID'}
              </button>
            </div>
            {copyError && (
              <p className="committer-note" role="status">
                {copyError}
              </p>
            )}
            <h2>{c.subject}</h2>
            {actions}
            <div className="author-identity">
              <span className="author-avatar">{c.author.slice(0, 2).toUpperCase()}</span>
              <div>
                <strong>{c.author}</strong>
                <span>{c.authorEmail}</span>
              </div>
              <time>{new Date(c.date).toLocaleString('zh-CN')}</time>
            </div>
            {(details.committer !== c.author ||
              details.committerEmail !== c.authorEmail ||
              details.committedAt !== c.date) && (
              <p className="committer-note">
                提交者：{details.committer} &lt;{details.committerEmail}&gt; /{' '}
                {new Date(details.committedAt).toLocaleString('zh-CN')}
              </p>
            )}
            {details.body && (
              <details className="commit-body">
                <summary>提交说明</summary>
                <p>{details.body}</p>
              </details>
            )}
            <p className="comparison-note">
              {c.parents.length > 1
                ? `合并提交 / 相对第一父提交 ${c.parents[0].slice(0, 7)}`
                : c.parents.length
                  ? `相对父提交 ${c.parents[0].slice(0, 7)}`
                  : '首次提交 / 相对空目录'}
            </p>
          </div>
          <div className="commit-files" aria-label="提交变更文件">
            <div className="commit-files-heading">
              变更文件 <span>{details.files.length}</span>
              <small>
                +{details.files.reduce((n, f) => n + f.additions, 0)} / −
                {details.files.reduce((n, f) => n + f.deletions, 0)}
              </small>
            </div>
            {details.files.map((file) => (
              <button
                className={`commit-file ${path === file.path ? 'selected' : ''}`}
                key={file.path}
                aria-pressed={path === file.path}
                onClick={() => setPath(file.path)}
              >
                <span className="file-status">{file.status[0]}</span>
                <FileText size={14} />
                <span title={file.path}>
                  {file.oldPath ? `${file.oldPath} → ` : ''}
                  {file.path}
                </span>
                <small>{file.binary ? '二进制' : `+${file.additions} −${file.deletions}`}</small>
              </button>
            ))}
            {!details.files.length && <p className="comparison-note">这个提交没有文件变更。</p>}
          </div>
        </div>
        {path ? (
          renderDiff(
            patch?.key === patchKey ? patch.value : null,
            !patchError && patch?.key !== patchKey,
            patchError,
          )
        ) : (
          <div className="empty-state">这个提交没有可显示的文件差异。</div>
        )}
      </ResizableSplit>
    </section>
  );
}
