import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { isMyGo } from 'mygo-runtime';
import {
  Archive,
  Globe2,
  Download,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  FileCode2,
  FileText,
  FolderGit2,
  FolderOpen,
  GitBranch,
  GitCommitHorizontal,
  GitFork,
  History,
  Layers2,
  LoaderCircle,
  Minus,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Terminal,
  Workflow,
  X,
  XCircle,
} from 'lucide-react';
import {
  events,
  Git,
  type Preferences,
  type Commit,
  type Diff,
  type File,
  type Recent,
  type Snapshot,
} from './mygo';
import { buildGraph, fileStatus, isStaged, isUnstaged } from './git-view';
import { demoDiff, demoSnapshot } from './demo';
import { applyPreferences, cachedPreferences } from './appearance';
import { SettingsPanel } from './SettingsPanel';
import { HistoryDetails } from './HistoryDetails';
import { DiffPanel, type Selection } from './DiffPanel';
import { SyncSummary, CommandDetails, syncCommand } from './SyncSummary';
import { quoteGitArg } from './sync-plan';
import { Dialog } from './Dialog';
import { NewRepositoryDialog } from './NewRepositoryDialog';
import { StashPanel } from './StashPanel';
import { RemotePanel } from './RemotePanel';

const native = isMyGo();
type View = 'changes' | 'history' | 'worktrees' | 'activity' | 'stashes' | 'remotes';
type Modal =
  | { kind: 'open' }
  | { kind: 'branch' }
  | { kind: 'help' }
  | { kind: 'publish' }
  | { kind: 'switch'; name: string }
  | { kind: 'sync'; action: 'fetch' | 'pull' | 'push'; plan?: Snapshot };
type Notice = { kind: 'success' | 'error'; text: string } | null;
const viewNames: Record<View, string> = {
  changes: '工作区',
  history: '提交历史',
  worktrees: '工作树',
  activity: '操作记录',
  stashes: '工作现场',
  remotes: '仓库连接',
};
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));
const basename = (path: string) => path.split('/').at(-1) || path;
const dirname = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');
const formatDate = (date: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));

function Mark({ small = false }: { small?: boolean }) {
  return (
    <span className={`brand-mark ${small ? 'small' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 32 32" fill="none">
        <path
          d="M10 24V8M10 19c0-9 12-2 12-11"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <circle cx="10" cy="8" r="3" fill="currentColor" />
        <circle cx="10" cy="24" r="3" fill="currentColor" />
        <circle cx="22" cy="8" r="3" fill="currentColor" />
      </svg>
    </span>
  );
}

export default function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(native ? null : demoSnapshot);
  const [recents, setRecents] = useState<Recent[]>([]);
  const [view, setView] = useState<View>('changes');
  const [selection, setSelection] = useState<Selection>(
    native ? null : { kind: 'file', path: demoSnapshot.files[0].path, staged: false },
  );
  const [diff, setDiff] = useState<Diff | null>(null);
  const [diffBusy, setDiffBusy] = useState(false);
  const [diffError, setDiffError] = useState('');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState<Notice>(null);
  const [modal, setModal] = useState<Modal | null>(null);
  const [showNewRepository, setShowNewRepository] = useState(false);
  const [autoRefreshError, setAutoRefreshError] = useState('');
  const [input, setInput] = useState('');
  const [remote, setRemote] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [preferences, setPreferences] = useState<Preferences>(cachedPreferences);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const preferencesBusy = useRef(false);
  useEffect(() => {
    applyPreferences(preferences);
    const query = matchMedia('(prefers-color-scheme: dark)');
    const changed = () => applyPreferences(preferences);
    query.addEventListener('change', changed);
    return () => query.removeEventListener('change', changed);
  }, [preferences]);
  useEffect(() => {
    if (!native) return;
    let active = true;
    Git.preferences()
      .then((p) => {
        if (active) setPreferences(p);
      })
      .catch((e) => setNotice({ kind: 'error', text: messageOf(e) }));
    const off = events.settingsRequested.on(() => setShowSettings(true));
    return () => {
      active = false;
      off();
    };
  }, []);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        setShowSettings(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  const savePreferences = async (next: Preferences) => {
    if (preferencesBusy.current) return;
    preferencesBusy.current = true;
    setSavingPreferences(true);
    try {
      if (native) await Git.savePreferences(next);
      setPreferences(next);
    } catch (e) {
      setNotice({ kind: 'error', text: messageOf(e) });
    } finally {
      preferencesBusy.current = false;
      setSavingPreferences(false);
    }
  };
  const [search, setSearch] = useState('');
  const [drafts, setDrafts] = useState<Record<string, { title: string; body: string }>>({});
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [diffVersion, setDiffVersion] = useState(0);
  const busyRef = useRef(false);
  const rootRef = useRef(snapshot?.root || '');
  const requestVersion = useRef(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;

  const applySnapshot = (next: Snapshot, reset = false) => {
    rootRef.current = next.root;
    setSnapshot(next);
    setLastUpdated(new Date());
    if (reset) {
      requestVersion.current++;
      setDiff(null);
      setSearch('');
      setView('changes');
      const file = next.files.find(isUnstaged) || next.files.find(isStaged);
      setSelection(file ? { kind: 'file', path: file.path, staged: !isUnstaged(file) } : null);
    }
    setDiffVersion((n) => n + 1);
  };

  const previewNotice = () =>
    setNotice({
      kind: 'error',
      text: '当前是浏览器只读预览。请运行 MyGo 桌面应用，再操作真实 Git 仓库。',
    });

  const loadRepo = async (path?: string) => {
    if (!native) {
      previewNotice();
      return;
    }
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy('打开仓库');
    setNotice(null);
    requestVersion.current++;
    try {
      const next = path ? await Git.open(path) : await Git.choose();
      if (next) {
        applySnapshot(next, true);
        setRecents((items) =>
          [
            { name: next.name, path: next.root },
            ...items.filter((item) => item.path !== next.root),
          ].slice(0, 8),
        );
        setModal(null);
      }
    } catch (error) {
      setNotice({ kind: 'error', text: messageOf(error) });
    } finally {
      busyRef.current = false;
      setBusy('');
    }
  };

  const createRepository = async (
    source: string,
    target: string,
    initialize: boolean,
    existing = false,
  ) => {
    if (!native) {
      setShowNewRepository(false);
      previewNotice();
      return;
    }
    if (busyRef.current) return;
    busyRef.current = true;
    requestVersion.current++;
    setBusy(initialize ? '初始化仓库' : '克隆仓库');
    setNotice(null);
    try {
      const next = existing
        ? await Git.initializeExisting(target)
        : await Git.createRepository(source, target, initialize);
      applySnapshot(next, true);
      setRecents((items) =>
        [{ name: next.name, path: next.root }, ...items.filter((i) => i.path !== next.root)].slice(
          0,
          8,
        ),
      );
      setShowNewRepository(false);
      setNotice({
        kind: 'success',
        text: initialize ? '仓库已创建，可以开始第一次提交。' : '克隆完成，已打开新仓库。',
      });
    } catch (error) {
      setNotice({ kind: 'error', text: messageOf(error) });
    } finally {
      busyRef.current = false;
      setBusy('');
    }
  };

  const refresh = async () => {
    if (!snapshot || busyRef.current) return;
    if (!native) {
      setLastUpdated(new Date());
      return;
    }
    const root = snapshot.root;
    busyRef.current = true;
    setBusy('刷新状态');
    try {
      const next = await Git.snapshot(root);
      if (rootRef.current === root) applySnapshot(next);
    } catch (error) {
      setNotice({ kind: 'error', text: messageOf(error) });
    } finally {
      busyRef.current = false;
      setBusy('');
    }
  };

  const mutate = async (
    label: string,
    action: (root: string) => Promise<unknown>,
    success: string,
    after?: () => void,
  ) => {
    if (!native) {
      previewNotice();
      return false;
    }
    if (!snapshot || busyRef.current) return false;
    const root = snapshot.root;
    busyRef.current = true;
    requestVersion.current++;
    setBusy(label);
    setNotice(null);
    setModal(null);
    let completed = false;
    try {
      await action(root);
      completed = true;
      after?.();
      const next = await Git.snapshot(root);
      if (rootRef.current === root) applySnapshot(next);
      setNotice({ kind: 'success', text: success });
    } catch (error) {
      setNotice({
        kind: 'error',
        text: `${completed ? '操作已完成，但刷新失败：' : ''}${messageOf(error)}`,
      });
      // A failed pull or hook may still change repository state; always read it again.
      if (!completed) {
        try {
          applySnapshot(await Git.snapshot(root));
        } catch {
          /* Preserve the original error. */
        }
      }
    } finally {
      busyRef.current = false;
      setBusy('');
    }
    return completed;
  };

  useEffect(() => {
    let active = true;
    const start = async () => {
      if (native) {
        try {
          const startup = await Git.bootstrap();
          if (!active) return;
          setRecents(startup.recents);
          if (startup.path) await loadRepo(startup.path);
        } catch (error) {
          if (active) setNotice({ kind: 'error', text: messageOf(error) });
        }
      }
      document.documentElement.dataset.ready = 'true';
    };
    void start();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!notice || notice.kind === 'error') return;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!snapshot || selection?.kind !== 'file') return;
    const file = snapshot.files.find((file) => file.path === selection.path);
    if (file && (selection.staged ? isStaged(file) : isUnstaged(file))) return;
    if (file) setSelection({ kind: 'file', path: file.path, staged: isStaged(file) });
    else {
      const next = snapshot.files.find(isUnstaged) || snapshot.files.find(isStaged);
      setSelection(next ? { kind: 'file', path: next.path, staged: !isUnstaged(next) } : null);
    }
  }, [snapshot, selection]);

  useEffect(() => {
    const version = ++requestVersion.current;
    setDiff(null);
    setDiffError('');
    if (!snapshot || !selection || selection.kind !== 'file') {
      setDiffBusy(false);
      return;
    }
    setDiffBusy(true);
    const promise = native
      ? Git.diff(snapshot.root, selection.path, selection.staged)
      : Promise.resolve(demoDiff(selection.path));
    promise
      .then((result) => {
        if (requestVersion.current === version) setDiff(result);
      })
      .catch((error) => {
        if (requestVersion.current === version) setDiffError(messageOf(error));
      })
      .finally(() => {
        if (requestVersion.current === version) setDiffBusy(false);
      });
    return () => {
      requestVersion.current++;
    };
  }, [snapshot?.root, selection, diffVersion]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (document.querySelector('[role="dialog"]')) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'o') {
        event.preventDefault();
        setInput('');
        setModal({ kind: 'open' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const focus = () => {
      const root = rootRef.current;
      if (!native || !root || busyRef.current) return;
      busyRef.current = true;
      void Git.snapshot(root)
        .then((next) => {
          if (rootRef.current === root) applySnapshot(next);
        })
        .catch((error) => setNotice({ kind: 'error', text: `刷新失败：${messageOf(error)}` }))
        .finally(() => {
          busyRef.current = false;
        });
    };
    window.addEventListener('focus', focus);
    return () => window.removeEventListener('focus', focus);
  }, []);

  useEffect(() => {
    if (!native || !snapshot?.root) return;
    const root = snapshot.root;
    let active = true;
    let running = false;
    let previous = '';
    const check = async () => {
      if (!active || running || busyRef.current || document.visibilityState !== 'visible') return;
      running = true;
      const epoch = requestVersion.current;
      try {
        const token = await Git.changeToken(root);
        if (
          !active ||
          busyRef.current ||
          rootRef.current !== root ||
          epoch !== requestVersion.current
        )
          return;
        if (token !== previous) {
          const next = await Git.snapshot(root);
          if (
            !active ||
            busyRef.current ||
            rootRef.current !== root ||
            epoch !== requestVersion.current
          )
            return;
          applySnapshot(next);
          previous = token;
        }
        setAutoRefreshError('');
      } catch (e) {
        if (active) setAutoRefreshError(messageOf(e));
      } finally {
        running = false;
      }
    };
    const timer = setInterval(() => void check(), 3000);
    const visible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', visible);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [snapshot?.root]);

  const openModal = (next: Modal) => {
    setInput(next.kind === 'publish' ? snapshot?.branch || '' : '');
    if (next.kind === 'publish') setRemote(snapshot?.remotes[0] || '');
    setModal(next.kind === 'sync' ? { ...next, plan: snapshot || undefined } : next);
  };
  const changeView = (next: View) => {
    setView(next);
    setSearch('');
    if (next === 'history')
      setSelection(
        snapshot?.commits[0] ? { kind: 'commit', hash: snapshot.commits[0].hash } : null,
      );
    if (next === 'changes') {
      const file = snapshot?.files.find(isUnstaged) || snapshot?.files.find(isStaged);
      setSelection(file ? { kind: 'file', path: file.path, staged: !isUnstaged(file) } : null);
    }
  };
  const unstaged = snapshot?.files.filter(isUnstaged) || [];
  const staged = snapshot?.files.filter(isStaged) || [];
  const conflicts = snapshot?.files.some((file) => file.conflicted);
  const draft = drafts[snapshot?.root || ''] || { title: '', body: '' };
  const setDraft = (part: Partial<typeof draft>) => {
    if (snapshot) setDrafts((old) => ({ ...old, [snapshot.root]: { ...draft, ...part } }));
  };
  const stageFiles = (files: File[], stage: boolean) =>
    void mutate(
      stage ? '暂存文件' : '取消暂存',
      (root) =>
        Git.stage(
          root,
          files.map((file) => file.path),
          stage,
        ),
      stage ? '已暂存所选文件。工作区内容保持不变。' : '已取消暂存，文件修改仍保留在工作区。',
    );

  const submitCommit = (event?: FormEvent) => {
    event?.preventDefault();
    if (
      !snapshot ||
      !staged.length ||
      !draft.title.trim() ||
      busy ||
      conflicts ||
      snapshot.detached ||
      snapshot.state
    )
      return;
    const root = snapshot.root;
    const message = draft.title.trim() + (draft.body.trim() ? '\n\n' + draft.body.trim() : '');
    void mutate(
      '创建提交',
      (root) => Git.commit(root, message),
      '提交成功。仅已暂存的修改包含在此次提交中。',
      () => setDrafts((items) => ({ ...items, [root]: { title: '', body: '' } })),
    );
  };

  const modalSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!modal || busyRef.current) return;
    if (modal.kind === 'open') {
      if (input.trim()) void loadRepo(input.trim());
    }
    if (modal.kind === 'branch' && input.trim())
      void mutate(
        '创建分支',
        (root) => Git.branch(root, input.trim(), true),
        `已创建并切换到 ${input.trim()}`,
      );
    if (modal.kind === 'switch')
      void mutate(
        '切换分支',
        (root) => Git.branch(root, modal.name, false),
        `已切换到 ${modal.name}`,
      );
    if (modal.kind === 'publish' && remote && input.trim())
      void mutate(
        '首次推送',
        (root) => Git.publish(root, remote, input.trim()),
        '推送成功，已建立上游跟踪关系。',
      );
    if (modal.kind === 'sync')
      void mutate(
        modal.action,
        (root) =>
          Git.sync(
            root,
            modal.action,
            modal.plan?.branch || '',
            modal.plan?.upstreamRemote || '',
            modal.plan?.upstreamBranch || '',
          ),
        `${modal.action === 'fetch' ? '获取远程状态' : modal.action === 'pull' ? '快进拉取' : '推送'}完成`,
      );
  };

  return (
    <div className="app-shell" data-repo-root={snapshot?.root || ''}>
      <header className="titlebar">
        <div className="titlebar-label">
          <Mark small /> <span>Gitlane</span>
          <span className="titlebar-divider" />{' '}
          <span className="titlebar-caption">A clearer path for your code.</span>
        </div>
        <div className="titlebar-right">
          {!native && <span className="preview-badge">浏览器预览 · 示例数据</span>}
          <span className="local-dot" /> LOCAL FIRST
        </div>
      </header>

      <aside className="sidebar">
        <button
          className="repository-picker"
          aria-label="打开或切换仓库"
          onClick={() => openModal({ kind: 'open' })}
          disabled={!!busy}
          title="打开或切换仓库"
        >
          <span className="repo-avatar">
            <FolderGit2 size={23} />
          </span>
          <span className="repo-text">
            <strong data-testid="repo-name">{snapshot?.name || '打开仓库'}</strong>
            <span>{snapshot ? '本地 Git 仓库' : '选择一个本地项目'}</span>
          </span>
          <ChevronDown size={14} />
        </button>
        <button
          className="new-repository-button"
          aria-label="克隆或新建仓库"
          title="克隆或新建仓库"
          disabled={!!busy}
          onClick={() => setShowNewRepository(true)}
        >
          <Download size={15} />
          <span>克隆 / 新建仓库</span>
          <Plus size={13} />
        </button>
        <div className="section-eyebrow">
          WORKSPACE <span>工作空间</span>
        </div>
        <nav aria-label="主导航" className="main-nav">
          <NavButton
            active={view === 'changes'}
            onClick={() => changeView('changes')}
            icon={<Layers2 />}
            label="工作区"
            count={snapshot?.files.length || 0}
          />
          <NavButton
            active={view === 'history'}
            onClick={() => changeView('history')}
            icon={<History />}
            label="提交历史"
          />
          <NavButton
            active={view === 'stashes'}
            onClick={() => changeView('stashes')}
            icon={<Archive />}
            label="工作现场"
            count={snapshot?.stashes.length || 0}
          />
          <NavButton
            active={view === 'remotes'}
            onClick={() => changeView('remotes')}
            icon={<Globe2 />}
            label="仓库连接"
          />
          <NavButton
            active={view === 'worktrees'}
            onClick={() => changeView('worktrees')}
            icon={<Workflow />}
            label="工作树"
            count={snapshot?.worktrees.length || 0}
          />
          <NavButton
            active={view === 'activity'}
            onClick={() => changeView('activity')}
            icon={<Clock3 />}
            label="操作记录"
          />
        </nav>
        <div className="sidebar-scroll">
          <div className="section-eyebrow branch-heading">
            BRANCHES <span>本地分支</span>
            <button
              className="icon-button"
              aria-label="新建分支"
              title="新建分支"
              disabled={!snapshot || !!busy}
              onClick={() => openModal({ kind: 'branch' })}
            >
              <Plus size={15} />
            </button>
          </div>
          <div className="branch-list">
            {snapshot?.branches
              .filter((branch) => !branch.remote)
              .map((branch) => (
                <button
                  className={`branch-item ${branch.current ? 'current' : ''}`}
                  key={branch.name}
                  disabled={!!busy}
                  title={branch.name}
                  onClick={() =>
                    branch.current
                      ? changeView('history')
                      : openModal({ kind: 'switch', name: branch.name })
                  }
                >
                  <GitBranch size={15} />
                  <span>{branch.name}</span>
                  {branch.current && <span className="branch-dot" />}
                </button>
              ))}
            {(!snapshot || snapshot.unborn) && (
              <p className="sidebar-empty">
                {snapshot?.unborn ? `${snapshot.branch} · 等待首次提交` : '打开仓库后显示分支'}
              </p>
            )}
          </div>
          <div className="section-eyebrow remote-heading">
            REMOTES <span>远程分支</span>
          </div>
          <div className="branch-list remote-list">
            {snapshot?.branches
              .filter((branch) => branch.remote)
              .map((branch) => (
                <div className="remote-item" key={branch.name} title={branch.name}>
                  <GitFork size={14} />
                  <span>{branch.name}</span>
                </div>
              ))}
            {!snapshot?.remotes.length && <p className="sidebar-empty">尚无远程仓库</p>}
          </div>
        </div>
        <div className="sidebar-bottom">
          <button aria-label="设置与外观" title="设置与外观" onClick={() => setShowSettings(true)}>
            <Settings size={16} /> 设置与外观 <span className="settings-shortcut">⌘ ,</span>
          </button>
          <div className="safety-note">
            <ShieldCheck size={17} />
            <span>每一步，都心中有数。</span>
          </div>
          <button onClick={() => openModal({ kind: 'help' })}>
            <CircleHelp size={16} /> 使用指南 <ArrowUpRight size={14} />
          </button>
          <div className="sidebar-version">
            <span>Gitlane</span>
            <span>
              v0.3.1 <span className="tiny-dot" /> MyGo
            </span>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <div className="workspace-topbar">
          <div className="breadcrumb">
            <FolderGit2 size={16} />
            <span>{snapshot?.name || 'Gitlane'}</span>
            <ChevronRight size={13} />
            <strong>{viewNames[view]}</strong>
          </div>
          <div className="topbar-tools">
            <label className="search-box">
              <Search size={15} />
              <input
                ref={searchRef}
                aria-label="搜索文件或提交"
                placeholder={view === 'history' ? '搜索提交、作者或 ID…' : '搜索文件…'}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                disabled={!snapshot || !['changes', 'history'].includes(view)}
              />
              {search ? (
                <button aria-label="清空搜索" onClick={() => setSearch('')}>
                  <X size={13} />
                </button>
              ) : (
                <kbd>⌘ K</kbd>
              )}
            </label>
            <button
              className="icon-button"
              title="刷新仓库状态"
              aria-label="刷新仓库状态"
              disabled={!snapshot || !!busy}
              onClick={() => void refresh()}
            >
              <RefreshCw size={17} className={busy === '刷新状态' ? 'spin' : ''} />
            </button>
          </div>
        </div>
        <section className="page-heading">
          <div>
            <div className="page-kicker">YOUR CODE, IN PERSPECTIVE</div>
            <h1>
              {viewNames[view]}
              <span className="heading-period">.</span>
            </h1>
            <p>
              {view === 'changes'
                ? '让每一次变更，都清晰可见。'
                : view === 'history'
                  ? '沿着提交的轨迹，看见代码如何生长。'
                  : view === 'stashes'
                    ? '给未完成的工作，留一份可以回来的现场。'
                    : view === 'remotes'
                      ? '让本地工作，与远程协作稳妥相连。'
                      : view === 'worktrees'
                        ? '一个仓库，多条并行的思路。'
                        : '操作有迹可循，结果清晰可查。'}
            </p>
          </div>
          <div className="heading-actions">
            {snapshot && (
              <>
                <button
                  className="button"
                  disabled={!!busy || !snapshot.remotes.length}
                  title="只更新远程引用，不改动工作区"
                  onClick={() => openModal({ kind: 'sync', action: 'fetch' })}
                >
                  <RefreshCw size={15} /> Fetch
                </button>
                <button
                  className="button"
                  disabled={!!busy || !snapshot.upstream || snapshot.detached || !!snapshot.state}
                  onClick={() => openModal({ kind: 'sync', action: 'pull' })}
                >
                  <ArrowDown size={15} /> 拉取{' '}
                  <span className="button-count">{snapshot.behind}</span>
                </button>
                <button
                  className="button primary"
                  disabled={
                    !!busy ||
                    !snapshot.remotes.length ||
                    snapshot.unborn ||
                    snapshot.detached ||
                    !!snapshot.state
                  }
                  onClick={() =>
                    openModal(
                      snapshot.upstream ? { kind: 'sync', action: 'push' } : { kind: 'publish' },
                    )
                  }
                >
                  <ArrowUp size={15} /> {snapshot.upstream ? '推送' : '首次推送'}{' '}
                  <span className="button-count">{snapshot.ahead}</span>
                </button>
              </>
            )}
          </div>
        </section>

        {snapshot ? (
          <>
            <div className="repository-status">
              <div className="current-branch">
                <GitBranch size={16} />
                <strong>{snapshot.detached ? 'Detached HEAD' : snapshot.branch}</strong>
                {!snapshot.detached && <span className="tag">当前分支</span>}
              </div>
              <div className="sync-status">
                {snapshot.upstream ? (
                  <>
                    <span>
                      <ArrowUp size={13} />
                      {snapshot.ahead} 未推送
                    </span>
                    <span>
                      <ArrowDown size={13} />
                      {snapshot.behind} 待拉取
                    </span>
                    <span className="upstream-label">{snapshot.upstream}</span>
                  </>
                ) : (
                  <span>{snapshot.unborn ? '等待首次提交' : '尚未设置上游分支'}</span>
                )}
              </div>
            </div>
            {(snapshot.detached || snapshot.state || conflicts) && (
              <div className="state-banner" role="status">
                <ShieldCheck size={17} />
                <span>
                  {conflicts
                    ? '存在冲突：请使用编辑器解决冲突；此版本不提供冲突编辑器。'
                    : snapshot.detached
                      ? '当前处于 Detached HEAD。请切换或创建分支后提交。'
                      : `正在进行 ${snapshot.state}，请在终端完成或退出后刷新。`}
                </span>
              </div>
            )}
            {view === 'changes' && (
              <div className="workbench">
                <section className="changes-panel" aria-label="文件与提交">
                  <div className="panel-title">
                    <span>
                      文件变更 <span className="muted-count">{snapshot.files.length}</span>
                    </span>
                    <span className="mono-label">CHANGES</span>
                  </div>
                  <div className="file-groups">
                    <FileGroup
                      title="未暂存的更改"
                      files={unstaged}
                      staged={false}
                      search={search}
                      selection={selection}
                      onSelect={setSelection}
                      onStage={stageFiles}
                      disabled={!!busy}
                    />
                    <FileGroup
                      title="已暂存的更改"
                      files={staged}
                      staged
                      search={search}
                      selection={selection}
                      onSelect={setSelection}
                      onStage={stageFiles}
                      disabled={!!busy}
                    />
                    {!snapshot.files.length && (
                      <div className="clean-workspace">
                        <span>
                          <Check size={25} />
                        </span>
                        <strong>工作区很干净</strong>
                        <p>
                          所有修改都已妥善收好。
                          <br />
                          可以开始下一个好想法了。
                        </p>
                      </div>
                    )}
                  </div>
                  <form
                    className="commit-form"
                    onSubmit={submitCommit}
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submitCommit(e);
                    }}
                  >
                    <div className="commit-form-title">
                      <GitCommitHorizontal size={17} />
                      <strong>创建提交</strong>
                      <span>{staged.length} 个已暂存</span>
                    </div>
                    <input
                      className="commit-title"
                      aria-label="提交说明"
                      placeholder="这次做了什么改变？"
                      maxLength={250}
                      value={draft.title}
                      onChange={(e) => setDraft({ title: e.target.value })}
                      disabled={!!busy}
                    />
                    <textarea
                      aria-label="提交详细说明"
                      placeholder="添加详细说明（可选）"
                      value={draft.body}
                      maxLength={18000}
                      onChange={(e) => setDraft({ body: e.target.value })}
                      disabled={!!busy}
                    />
                    <button
                      className="button primary commit-button"
                      type="submit"
                      disabled={
                        !!busy ||
                        !staged.length ||
                        !draft.title.trim() ||
                        conflicts ||
                        snapshot.detached ||
                        !!snapshot.state
                      }
                    >
                      {busy === '创建提交' ? (
                        <LoaderCircle size={16} className="spin" />
                      ) : (
                        <GitCommitHorizontal size={17} />
                      )}
                      <span>提交到 {snapshot.detached ? '分支' : snapshot.branch}</span>
                      <ArrowRight size={16} />
                    </button>
                    <div className="commit-footnote">
                      <ShieldCheck size={12} />
                      <span>仅提交已暂存的修改</span>
                      <kbd>⌘ ↵</kbd>
                    </div>
                  </form>
                </section>
                <DiffPanel
                  codeSize={preferences.codeSize}
                  onCodeSize={(codeSize) => void savePreferences({ ...preferences, codeSize })}
                  diff={diff}
                  loading={diffBusy}
                  error={diffError}
                  selection={selection}
                  snapshot={snapshot}
                  onStage={stageFiles}
                  onHunk={
                    selection?.kind === 'file' && diff?.revision
                      ? (id) => {
                          const chosen = selection;
                          const revision = diff.revision;
                          void mutate(
                            chosen.staged ? '取消暂存代码块' : '暂存代码块',
                            (root) => Git.stageHunk(root, chosen.path, chosen.staged, revision, id),
                            '所选代码块已更新，工作区文件内容保持不变。',
                          );
                        }
                      : undefined
                  }
                  disabled={!!busy}
                />
              </div>
            )}
            {view === 'history' && (
              <div className="history-workbench">
                <HistoryPanel
                  commits={snapshot.commits}
                  selection={selection}
                  search={search}
                  onSelect={setSelection}
                />
                <HistoryDetails
                  root={snapshot.root}
                  commit={
                    selection?.kind === 'commit'
                      ? snapshot.commits.find((c) => c.hash === selection.hash)
                      : undefined
                  }
                  version={diffVersion}
                  renderDiff={(fileDiff, loading, error) => (
                    <DiffPanel
                      codeSize={preferences.codeSize}
                      onCodeSize={(codeSize) => void savePreferences({ ...preferences, codeSize })}
                      diff={fileDiff}
                      loading={loading}
                      error={error}
                      selection={selection}
                      snapshot={snapshot}
                      onStage={stageFiles}
                      disabled
                    />
                  )}
                />
              </div>
            )}
            {view === 'stashes' && (
              <StashPanel
                key={snapshot.root}
                snapshot={snapshot}
                version={diffVersion}
                busy={!!busy}
                run={mutate}
                renderDiff={(stashDiff, loading, error, stash) => (
                  <DiffPanel
                    codeSize={preferences.codeSize}
                    onCodeSize={(codeSize) => void savePreferences({ ...preferences, codeSize })}
                    diff={stashDiff}
                    loading={loading}
                    error={error}
                    selection={stash ? { kind: 'stash', hash: stash.hash } : null}
                    snapshot={snapshot}
                    onStage={stageFiles}
                    disabled
                    readonlyTitle="Stash · 保存的现场"
                  />
                )}
              />
            )}
            {view === 'remotes' && (
              <RemotePanel
                key={snapshot.root}
                root={snapshot.root}
                version={diffVersion}
                busy={!!busy}
                run={mutate}
              />
            )}
            {view === 'worktrees' && (
              <section className="collection-panel">
                <div className="collection-header">
                  <span>
                    <Workflow size={18} /> 已连接的工作树
                  </span>
                  <span className="tag">{snapshot.worktrees.length} WORKTREES</span>
                </div>
                <p className="collection-intro">
                  每个工作树都有独立的目录和工作区。这里可查看并打开已有工作树；创建与删除请暂用 Git
                  命令行。
                </p>
                <div className="worktree-grid">
                  {snapshot.worktrees.map((tree) => (
                    <article
                      className={`worktree-card ${tree.path === snapshot.root ? 'active' : ''}`}
                      key={tree.path}
                    >
                      <div className="worktree-card-top">
                        <span className="worktree-icon">
                          <FolderGit2 size={26} />
                        </span>
                        {tree.path === snapshot.root && <span className="tag">当前工作树</span>}
                      </div>
                      <h2>{basename(tree.path)}</h2>
                      <div className="worktree-branch">
                        <GitBranch size={15} />
                        {tree.detached ? 'Detached HEAD' : tree.branch}
                      </div>
                      <p title={tree.path}>{tree.path}</p>
                      <button
                        className="button"
                        disabled={!!busy || tree.path === snapshot.root}
                        onClick={() => void loadRepo(tree.path)}
                      >
                        打开工作树 <ArrowUpRight size={15} />
                      </button>
                    </article>
                  ))}
                </div>
              </section>
            )}
            {view === 'activity' && (
              <section className="collection-panel">
                <div className="collection-header">
                  <span>
                    <Clock3 size={18} /> 本次会话的操作
                  </span>
                  <span className="tag">SESSION LOG</span>
                </div>
                <p className="collection-intro">
                  记录当前仓库最近 40
                  次操作的执行结果。不会把所有操作标记为“可撤销”，也不会持久化命令输出。
                </p>
                {snapshot.operations.length ? (
                  <div className="operation-list">
                    {snapshot.operations.map((operation, i) => (
                      <article className="operation-item" key={`${operation.time}-${i}`}>
                        <span className={`operation-icon ${operation.success ? '' : 'failed'}`}>
                          {operation.success ? <Check size={17} /> : <X size={17} />}
                        </span>
                        <div>
                          <h3>
                            {operation.label}
                            <span>{operation.success ? '已完成' : '未完成'}</span>
                          </h3>
                          <pre>{operation.detail || 'Git 命令执行成功，无额外输出。'}</pre>
                        </div>
                        <time>{formatDate(operation.time)}</time>
                      </article>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon={<Clock3 size={28} />}
                    title="每一步，都有记录"
                    text="暂存、提交或同步后，执行结果会显示在这里。"
                  />
                )}
              </section>
            )}
          </>
        ) : (
          <section className="welcome">
            <div className="welcome-art">
              <span className="art-line line-one" />
              <span className="art-line line-two" />
              <span className="art-node node-one" />
              <span className="art-node node-two" />
              <span className="art-node node-three" />
              <Mark />
            </div>
            <div className="page-kicker">LESS FRICTION. MORE FLOW.</div>
            <h2>好代码，从清晰开始。</h2>
            <p>
              打开一个本地仓库，让分支、变更和每一次提交，
              <br />
              都有一条看得见的路径。
            </p>
            <button className="button primary" disabled={!!busy} onClick={() => void loadRepo()}>
              <FolderOpen size={18} /> 打开 Git 仓库 <ArrowUpRight size={17} />
            </button>
            <button className="button" disabled={!!busy} onClick={() => setShowNewRepository(true)}>
              <Download size={17} />
              克隆 / 新建仓库
            </button>
            <button className="text-button" onClick={() => openModal({ kind: 'open' })}>
              或输入仓库路径 <ArrowRight size={13} />
            </button>
            {recents.length > 0 && (
              <div className="recent-welcome">
                <div className="section-eyebrow">
                  RECENT REPOSITORIES <span>最近打开</span>
                </div>
                {recents.slice(0, 4).map((recent) => (
                  <button
                    key={recent.path}
                    onClick={() => void loadRepo(recent.path)}
                    disabled={!!busy}
                  >
                    <FolderGit2 size={17} />
                    <span>
                      <strong>{recent.name}</strong>
                      <small>{recent.path}</small>
                    </span>
                    <ArrowUpRight size={15} />
                  </button>
                ))}
              </div>
            )}
          </section>
        )}
      </main>

      <footer className="statusbar">
        <span>
          <span className="status-dot" />
          {busy ? (
            <>
              <LoaderCircle size={12} className="spin" />
              {busy}…
            </>
          ) : native ? (
            '本地连接已就绪'
          ) : (
            '只读设计预览'
          )}
          {snapshot && (
            <span className="status-path" title={snapshot.root}>
              {snapshot.root}
            </span>
          )}
        </span>
        <span>
          {lastUpdated && (
            <span>
              更新于{' '}
              {lastUpdated.toLocaleTimeString('zh-CN', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          )}
          <span className="status-divider" />
          <ShieldCheck size={12} />{' '}
          <span title={autoRefreshError || '只检查本地变化，不自动 Fetch 或 Pull'}>
            {autoRefreshError
              ? '自动检查失败 · 可手动刷新'
              : native
                ? '本地自动检查 · 不自动远程同步'
                : '无后台自动同步'}
          </span>
        </span>
      </footer>
      {notice && (
        <div className={`toast ${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>
          {notice.kind === 'error' ? <XCircle size={19} /> : <CheckCircle2 size={19} />}
          <span>{notice.text}</span>
          <button aria-label="关闭提示" onClick={() => setNotice(null)}>
            <X size={16} />
          </button>
        </div>
      )}

      {showNewRepository && !showSettings && (
        <NewRepositoryDialog
          busy={!!busy}
          onClose={() => !busy && setShowNewRepository(false)}
          onCreate={createRepository}
        />
      )}
      {showSettings && (
        <Dialog onClose={() => setShowSettings(false)}>
          <div className="settings-title">
            <div>
              <div className="modal-kicker">GITLANE / PREFERENCES</div>
              <h2 id="modal-title">给专注，换一种底色。</h2>
            </div>
          </div>
          <SettingsPanel
            value={preferences}
            saving={savingPreferences}
            onChange={(p) => void savePreferences(p)}
          />
        </Dialog>
      )}
      {modal && !showSettings && !showNewRepository && (
        <Dialog onClose={() => !busy && setModal(null)}>
          <form onSubmit={modalSubmit}>
            <div className="modal-kicker">
              <Mark small /> GITLANE /{' '}
              {modal.kind === 'open'
                ? 'REPOSITORIES'
                : modal.kind === 'help'
                  ? 'FIELD GUIDE'
                  : 'NEXT STEP'}
            </div>
            <h2 id="modal-title">
              {modal.kind === 'open'
                ? '给代码一个新视角。'
                : modal.kind === 'branch'
                  ? '开启一条新分支。'
                  : modal.kind === 'switch'
                    ? '切换你的工作方向。'
                    : modal.kind === 'help'
                      ? '保持清晰，放心前行。'
                      : modal.kind === 'publish'
                        ? '发布当前分支。'
                        : modal.action === 'fetch'
                          ? '获取远程更新。'
                          : modal.action === 'pull'
                            ? '确认拉取更新？'
                            : '确认推送到远程？'}
            </h2>
            {modal.kind === 'open' && (
              <>
                <p className="modal-description">
                  选择已有的本地 Git 仓库。打开操作不会改动仓库内容；也可以克隆或新建一个项目。
                </p>
                <label className="field-label" htmlFor="modal-input">
                  仓库绝对路径
                </label>
                <input
                  id="modal-input"
                  autoFocus
                  placeholder="/Users/you/Code/project"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={!!busy}
                />
                <div className="modal-buttons">
                  <button
                    className="button"
                    type="button"
                    onClick={() => void loadRepo()}
                    disabled={!!busy}
                  >
                    <FolderOpen size={16} /> 浏览文件夹
                  </button>
                  <button className="button primary" disabled={!!busy || !input.trim()}>
                    打开仓库 <ArrowRight size={15} />
                  </button>
                </div>
                <button
                  className="text-button"
                  type="button"
                  disabled={!!busy}
                  onClick={() => {
                    setModal(null);
                    setShowNewRepository(true);
                  }}
                >
                  克隆 / 新建仓库 <Plus size={14} />
                </button>
                {recents.length > 0 && (
                  <div className="modal-recents">
                    <div className="section-eyebrow">
                      RECENT <span>最近打开</span>
                    </div>
                    {recents.map((recent) => (
                      <button
                        key={recent.path}
                        type="button"
                        onClick={() => void loadRepo(recent.path)}
                        disabled={!!busy}
                      >
                        <FolderGit2 size={17} />
                        <span>
                          <strong>{recent.name}</strong>
                          <small>{recent.path}</small>
                        </span>
                        <ArrowUpRight size={15} />
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
            {modal.kind === 'branch' && (
              <>
                <p className="modal-description">
                  从当前 HEAD
                  创建并切换到新分支。为保护未提交的修改，当前工作区必须干净；可先在「工作现场」保存
                  Stash。
                </p>
                <label className="field-label" htmlFor="modal-input">
                  新分支名称
                </label>
                <input
                  id="modal-input"
                  autoFocus
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="feature/your-next-idea"
                />
                <div className="command-preview">
                  <Terminal size={15} />
                  <code>git switch -c {input || '<branch-name>'}</code>
                </div>
                <div className="modal-buttons">
                  <button className="button" type="button" onClick={() => setModal(null)}>
                    取消
                  </button>
                  <button className="button primary" disabled={!!busy || !input.trim()}>
                    创建并切换 <GitBranch size={15} />
                  </button>
                </div>
              </>
            )}
            {modal.kind === 'switch' && (
              <>
                <p className="modal-description">
                  从 <strong>{snapshot?.branch}</strong> 切换到 <strong>{modal.name}</strong>
                  。工作区必须干净；不会丢弃修改或自动执行 Stash。
                </p>
                <div className="command-preview">
                  <Terminal size={15} />
                  <code>git switch --no-guess {modal.name}</code>
                </div>
                <div className="modal-buttons">
                  <button className="button" type="button" onClick={() => setModal(null)}>
                    保留当前分支
                  </button>
                  <button className="button primary" disabled={!!busy}>
                    确认切换 <ArrowRight size={15} />
                  </button>
                </div>
              </>
            )}
            {modal.kind === 'publish' && (
              <>
                <p className="modal-description">
                  只推送当前分支，并建立上游跟踪关系。不会强制覆盖远程，也不会推送其他分支或标签；如果远程历史冲突，操作会停止。
                </p>
                <label className="publish-label" htmlFor="publish-remote">
                  远程仓库
                </label>
                <select
                  id="publish-remote"
                  className="modal-input"
                  value={remote}
                  onChange={(e) => setRemote(e.target.value)}
                >
                  {snapshot?.remotes.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
                <label className="publish-label" htmlFor="publish-branch">
                  远程分支名
                </label>
                <input
                  id="publish-branch"
                  className="modal-input"
                  required
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                />
                <SyncSummary
                  action="push"
                  plan={snapshot || undefined}
                  publish={{ remote, branch: input.trim() }}
                />
                <CommandDetails
                  command={
                    remote && input.trim()
                      ? `git push --set-upstream --no-force --no-follow-tags --recurse-submodules=no ${quoteGitArg(remote)} ${quoteGitArg(`HEAD:refs/heads/${input.trim()}`)}`
                      : ''
                  }
                />
                <div className="safety-callout">
                  <ShieldCheck size={18} />
                  <span>
                    这会更新远程仓库，其他协作者可见。远程仓库请事先配置好 SSH 密钥或凭据助手。
                  </span>
                </div>
                <div className="modal-buttons">
                  <button type="button" className="button" onClick={() => setModal(null)}>
                    取消
                  </button>
                  <button className="button primary" disabled={!!busy || !remote || !input.trim()}>
                    确认首次推送
                  </button>
                </div>
              </>
            )}
            {modal.kind === 'sync' && (
              <>
                <SyncSummary action={modal.action} plan={modal.plan} />
                <p className="modal-description sync-description">
                  {modal.action === 'push'
                    ? '仅推送已提交的代码。未提交或只暂存的修改不会上传；如果远程历史冲突，操作会停止。'
                    : modal.action === 'pull'
                      ? '工作区必须干净。如果本地与远程历史已分叉，操作会停止，需要先处理分支关系。'
                      : '获取后，待推送与待拉取数量会按最新远程状态更新。'}
                </p>
                <CommandDetails command={syncCommand(modal.action, modal.plan)} />
                <div className="safety-callout">
                  <ShieldCheck size={18} />
                  <span>
                    {modal.action === 'push'
                      ? '这会更新远程仓库，其他协作者可见。'
                      : '不自动改写提交历史，不执行强制操作。'}
                  </span>
                </div>
                <div className="modal-buttons">
                  <button className="button" type="button" onClick={() => setModal(null)}>
                    取消
                  </button>
                  <button
                    className="button primary"
                    disabled={
                      !!busy ||
                      !modal.plan ||
                      (modal.action === 'push' &&
                        (!modal.plan.upstreamRemote ||
                          !modal.plan.upstreamBranch ||
                          modal.plan.behind > 0))
                    }
                  >
                    {modal.action === 'fetch'
                      ? '获取远程更新'
                      : modal.action === 'pull'
                        ? '确认拉取'
                        : modal.plan && modal.plan.ahead > 0
                          ? `推送 ${modal.plan.ahead} 个提交`
                          : '确认推送'}{' '}
                    <ArrowRight size={15} />
                  </button>
                </div>
              </>
            )}
            {modal.kind === 'help' && (
              <>
                <p className="modal-description">
                  一个轻量、克制的本地 Git 工作台。Go 负责 Git，MyGo 负责桌面，界面只展示真实状态。
                </p>
                <div className="guide-steps">
                  <div>
                    <span>01</span>
                    <p>
                      <strong>先看变更，再做决定</strong>点击文件查看 Diff；绿色是新增，红色是删除。
                    </p>
                  </div>
                  <div>
                    <span>02</span>
                    <p>
                      <strong>暂存是提交前的选择</strong>用文件旁的 + 暂存，或用 −
                      取消暂存。取消暂存不会丢弃代码。
                    </p>
                  </div>
                  <div>
                    <span>03</span>
                    <p>
                      <strong>提交到本地，再同步远程</strong>
                      写下提交说明，创建提交。Fetch、拉取、推送都需要你主动触发。
                    </p>
                  </div>
                </div>
                <div className="guide-shortcuts">
                  <span>
                    <kbd>⌘ / Ctrl K</kbd> 搜索
                  </span>
                  <span>
                    <kbd>⌘ / Ctrl O</kbd> 打开仓库
                  </span>
                  <span>
                    <kbd>⌘ / Ctrl ↵</kbd> 提交
                  </span>
                </div>
                <p className="guide-limit">
                  当前版本不支持冲突编辑、Rebase、强推、克隆和工作树创建。SSH 与凭据沿用系统 Git
                  配置；如认证需要交互，请先在终端完成。
                </p>
                <button
                  className="button primary full-width"
                  type="button"
                  onClick={() => setModal(null)}
                >
                  知道了 <Check size={16} />
                </button>
              </>
            )}
          </form>
        </Dialog>
      )}
    </div>
  );
}

function NavButton({
  active,
  icon,
  label,
  count,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      className={`nav-item ${active ? 'active' : ''}`}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
      {count !== undefined && <span className="nav-count">{count}</span>}
    </button>
  );
}

function FileGroup({
  title,
  files,
  staged,
  search,
  selection,
  onSelect,
  onStage,
  disabled,
}: {
  title: string;
  files: File[];
  staged: boolean;
  search: string;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onStage: (files: File[], stage: boolean) => void;
  disabled: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const filtered = files.filter((file) => file.path.toLowerCase().includes(search.toLowerCase()));
  return (
    <section className={`file-group ${staged ? 'staged' : ''}`}>
      <div className="file-group-header">
        <button aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}>
          <ChevronDown size={13} className={collapsed ? 'collapsed-chevron' : ''} />
          {title}
          <span>{files.length}</span>
        </button>
        <button
          className="icon-button"
          aria-label={staged ? '取消暂存全部' : '暂存全部'}
          title={staged ? '取消暂存全部' : '暂存全部'}
          disabled={disabled || !files.length}
          onClick={() => onStage(files, !staged)}
        >
          {staged ? <Minus size={15} /> : <Plus size={15} />}
        </button>
      </div>
      {!collapsed && (
        <div className="file-list">
          {filtered.map((file) => {
            const status = fileStatus(file, staged);
            const selected =
              selection?.kind === 'file' &&
              selection.path === file.path &&
              selection.staged === staged;
            return (
              <div
                data-testid="file-row"
                className={`file-row ${selected ? 'selected' : ''}`}
                key={file.path}
              >
                <button
                  className="file-select"
                  title={file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}
                  aria-pressed={selected}
                  onClick={() => onSelect({ kind: 'file', path: file.path, staged })}
                >
                  <span
                    className={`file-icon ${file.path.endsWith('.md') ? 'markdown' : file.path.endsWith('.css') ? 'css-file' : ''}`}
                  >
                    {file.path.endsWith('.md') ? <FileText size={17} /> : <FileCode2 size={17} />}
                  </span>
                  <span className="file-name">
                    <strong>{basename(file.path)}</strong>
                    {dirname(file.path) && <small>{dirname(file.path)}</small>}
                  </span>
                  <span className={`file-status ${status.className}`} title={status.label}>
                    {status.code}
                  </span>
                </button>
                <button
                  className="file-stage"
                  aria-label={`${staged ? '取消暂存' : '暂存'} ${file.path}`}
                  title={staged ? '取消暂存' : '暂存文件'}
                  disabled={disabled}
                  onClick={() => onStage([file], !staged)}
                >
                  {staged ? <Minus size={14} /> : <Plus size={14} />}
                </button>
              </div>
            );
          })}
          {!filtered.length && (
            <div className="group-empty">
              {files.length
                ? '没有匹配的文件'
                : staged
                  ? '暂存后，文件会出现在这里'
                  : '没有未暂存的更改'}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function HistoryPanel({
  commits,
  selection,
  search,
  onSelect,
}: {
  commits: Commit[];
  selection: Selection;
  search: string;
  onSelect: (selection: Selection) => void;
}) {
  const graph = useMemo(() => buildGraph(commits), [commits]);
  const query = search.toLowerCase();
  const rows = commits
    .map((commit, i) => ({ commit, graph: graph[i] }))
    .filter(({ commit }) =>
      `${commit.subject} ${commit.author} ${commit.authorEmail} ${commit.hash}`
        .toLowerCase()
        .includes(query),
    );
  const graphWidth = Math.max(56, ...graph.map((row) => 40 + row.lane * 18));
  return (
    <section className="history-panel" aria-label="提交列表">
      <div className="panel-title">
        <span>
          提交轨迹 <span className="muted-count">{commits.length}</span>
        </span>
        <span className="mono-label">LATEST 100</span>
      </div>
      <div className="history-caption">
        <GitBranch size={13} />
        {search ? '搜索结果 · 暂不显示连线' : '按拓扑顺序展示所有分支与 HEAD'}
      </div>
      <div className="commit-list">
        {rows.length ? (
          rows.map(({ commit, graph: row }) => (
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
                  <span>·</span>
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
        ) : (
          <EmptyState
            icon={<GitCommitHorizontal size={27} />}
            title={search ? '没有匹配的提交' : '故事正要开始'}
            text={
              search ? '试试提交说明、作者或完整提交 ID。' : '创建第一次提交后，轨迹会显示在这里。'
            }
          />
        )}
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
