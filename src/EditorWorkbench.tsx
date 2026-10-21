import { useEffect, useRef, useState, type ReactNode } from 'react';
import { isMyGo } from 'mygo-runtime';
import { ChevronRight, FileCode2, Folder, RefreshCw, Save, X } from 'lucide-react';
import { Git, type EditorDirectory, type EditorFile, type Snapshot } from './mygo';
import { EditorSurface } from './EditorSurface';
import { BinaryViewer } from './BinaryViewer';
import { Dialog } from './Dialog';
import { ErrorDetails } from './ErrorDetails';
import { ResizableSplit } from './ResizableSplit';
import type { Mutate } from './panel-types';
import {
  cacheEditorDrafts,
  dirtyDocument,
  documentID,
  readEditorDrafts,
  type EditorDocument,
} from './editor-state';

function FileTree({
  root,
  onOpen,
  selected,
}: {
  root: string;
  onOpen: (path: string) => void;
  selected?: string;
}) {
  const [directories, setDirectories] = useState<Record<string, EditorDirectory>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ '': true });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const pending = useRef(new Set<string>());
  const alive = useRef(true);
  const load = async (path: string) => {
    if (pending.current.has(path)) return;
    pending.current.add(path);
    setLoading((s) => ({ ...s, [path]: true }));
    try {
      const result = await Git.editorDirectory(root, path);
      if (alive.current) {
        setDirectories((s) => ({ ...s, [path]: result }));
        setError('');
      }
    } catch (e) {
      if (alive.current) setError(String(e));
    } finally {
      pending.current.delete(path);
      if (alive.current) setLoading((s) => ({ ...s, [path]: false }));
    }
  };
  useEffect(() => {
    alive.current = true;
    void load('');
    return () => {
      alive.current = false;
    };
  }, [root]);
  const rows = (path: string, depth: number): ReactNode => (
    <>
      {directories[path]?.entries.map((entry) => (
        <div key={entry.path}>
          <button
            className={`editor-tree-row ${selected === entry.path ? 'selected' : ''}`}
            style={{ paddingLeft: 10 + depth * 14 }}
            title={entry.path}
            aria-expanded={entry.directory ? !!expanded[entry.path] : undefined}
            onClick={() => {
              if (!entry.directory) {
                onOpen(entry.path);
                return;
              }
              setExpanded((s) => ({ ...s, [entry.path]: !s[entry.path] }));
              if (!directories[entry.path]) void load(entry.path);
            }}
          >
            {entry.directory ? (
              <>
                <ChevronRight size={12} className={expanded[entry.path] ? 'expanded' : ''} />
                <Folder size={14} />
              </>
            ) : (
              <FileCode2 size={14} />
            )}
            <span>{entry.name}</span>
            {loading[entry.path] && <RefreshCw size={12} className="spin" />}
          </button>
          {entry.directory && expanded[entry.path] && rows(entry.path, depth + 1)}
        </div>
      ))}
      {directories[path]?.truncated && (
        <p className="editor-tree-note">目录仅显示前 2000 项；可通过路径打开文件。</p>
      )}
    </>
  );
  return (
    <section className="editor-explorer" aria-label="仓库文件浏览器">
      <header className="panel-title">
        <span>文件浏览器</span>
        <button
          className="icon-button"
          aria-label="刷新文件树"
          onClick={() => {
            setExpanded({ '': true });
            setDirectories({});
            void load('');
          }}
        >
          <RefreshCw size={14} />
        </button>
      </header>
      <p className="editor-tree-note">工作目录 · 含未跟踪和忽略文件 · 不含 Git 元数据</p>
      {error && <ErrorDetails message={error} />}
      {loading[''] && <p className="editor-tree-note">正在读取…</p>}
      <div className="editor-tree">{rows('', 0)}</div>
    </section>
  );
}

export function EditorWorkbench({
  snapshot,
  visible,
  requested,
  busy,
  run,
  onDiff,
  persistDrafts = true,
}: {
  snapshot: Snapshot;
  visible: boolean;
  requested: { root: string; path: string; sequence: number } | null;
  busy: boolean;
  run: Mutate;
  onDiff: (path: string) => void;
  persistDrafts?: boolean;
}) {
  const native = isMyGo();
  const [documents, setDocuments] = useState<EditorDocument[]>(() =>
    native && persistDrafts ? readEditorDrafts() : [],
  );
  const docs = useRef(documents);
  const [active, setActive] = useState('');
  const [path, setPath] = useState('');
  const [error, setError] = useState('');
  const [cacheError, setCacheError] = useState('');
  const [external, setExternal] = useState<Record<string, boolean>>({});
  const [epochs, setEpochs] = useState<Record<string, number>>({});
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const [confirm, setConfirm] = useState<{ id: string; action: 'close' | 'reload' } | null>(null);
  const [working, setWorking] = useState(false);
  const [searchRequest, setSearchRequest] = useState<{ id: string; sequence: number } | null>(null);
  const pending = useRef(new Set<string>());
  const rootRef = useRef(snapshot.root);
  rootRef.current = snapshot.root;
  const dirtyQueue = useRef(Promise.resolve());
  const lastDirty = useRef(-1);
  const synchronize = (next: EditorDocument[]) => {
    if (!native) return;
    if (persistDrafts)
      setCacheError(
        cacheEditorDrafts(next) ? '' : '草稿缓存失败，请勿关闭窗口；先保存文件或复制内容。',
      );
    const count = next.filter(dirtyDocument).length;
    if (count === lastDirty.current) return;
    lastDirty.current = count;
    dirtyQueue.current = dirtyQueue.current
      .catch(() => {})
      .then(() => Git.editorDirty(count))
      .catch((e) => {
        lastDirty.current = -1;
        setCacheError(`退出保护同步失败：${String(e)}。请先保存，不要关闭窗口。`);
      });
  };
  const update = (next: EditorDocument[]) => {
    docs.current = next;
    setDocuments(next);
    synchronize(next);
  };
  useEffect(() => {
    synchronize(docs.current);
  }, []);
  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (docs.current.some(dirtyDocument)) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, []);
  const opened = documents.filter((d) => d.root === snapshot.root);
  const selected = opened.find((d) => documentID(d.root, d.path) === active) || opened[0];
  const selectedID = selected ? documentID(selected.root, selected.path) : '';
  const open = async (file: string) => {
    if (!native) {
      setError('浏览器仅供只读预览；请在桌面应用中编辑仓库文件。');
      return;
    }
    const root = snapshot.root,
      id = documentID(root, file);
    if (docs.current.some((d) => documentID(d.root, d.path) === id)) {
      setActive(id);
      return;
    }
    if (pending.current.has(id)) return;
    if (docs.current.length + pending.current.size >= 16) {
      setError('最多保留 16 个文件标签（含其他仓库），请先保存并关闭部分标签。');
      return;
    }
    pending.current.add(id);
    setWorking(true);
    setError('');
    try {
      const d = await readDocument(root, file);
      update([...docs.current, d]);
      if (rootRef.current === root) setActive(id);
    } catch (e) {
      setError(String(e));
    } finally {
      pending.current.delete(id);
      setWorking(pending.current.size > 0);
    }
  };
  useEffect(() => {
    if (requested?.root === snapshot.root) void open(requested.path);
  }, [requested?.sequence]);
  // An external edit never overwrites a buffer. Saving also checks the exact revision in Go.
  useEffect(() => {
    if (!native || !visible || !selected || selected.preview) return;
    const { root, path, revision } = selected;
    let alive = true;
    const check = () => {
      void Git.editorFile(root, path)
        .then((disk) => {
          if (alive) setExternal((s) => ({ ...s, [selectedID]: disk.revision !== revision }));
        })
        .catch(() => {
          if (alive) setExternal((s) => ({ ...s, [selectedID]: true }));
        });
    };
    check();
    window.addEventListener('focus', check);
    const timer = setInterval(check, 5000);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener('focus', check);
    };
  }, [native, visible, selectedID, selected?.revision]);
  const save = async (id: string) => {
    const d = docs.current.find((d) => documentID(d.root, d.path) === id);
    if (
      !d ||
      d.preview ||
      !dirtyDocument(d) ||
      busy ||
      pending.current.size ||
      d.root !== rootRef.current
    )
      return;
    pending.current.add(id);
    setWorking(true);
    setError('');
    let saved: EditorFile | undefined;
    try {
      const ok = await run(
        '保存编辑文件',
        async (root) => {
          if (root !== d.root) throw new Error('仓库已切换，请重新保存');
          saved = await Git.saveEditorFile(root, d.path, d.revision, d.content);
        },
        '文件已保存到工作区；未暂存、未提交。',
      );
      if (ok && saved) {
        const result = saved;
        update(
          docs.current.map((current) =>
            documentID(current.root, current.path) === id
              ? { ...current, original: result.content, revision: result.revision }
              : current,
          ),
        );
        setExternal((s) => ({ ...s, [id]: false }));
      }
    } catch (e) {
      setError(String(e));
    } finally {
      pending.current.delete(id);
      setWorking(false);
    }
  };
  const perform = async (id: string, action: 'close' | 'reload') => {
    const d = docs.current.find((d) => documentID(d.root, d.path) === id);
    if (!d || working) return;
    if (action === 'close') {
      update(docs.current.filter((item) => item !== d));
      setConfirm(null);
      return;
    }
    pending.current.add(id);
    setWorking(true);
    try {
      const disk = await readDocument(d.root, d.path);
      if (
        docs.current.find((item) => documentID(item.root, item.path) === id)?.content !== d.content
      )
        throw new Error('读取期间又有新编辑，已保留内容，请重新确认。');
      update(docs.current.map((item) => (item === d ? disk : item)));
      setEpochs((s) => ({ ...s, [id]: (s[id] || 0) + 1 }));
      setExternal((s) => ({ ...s, [id]: false }));
      setConfirm(null);
      setError('');
    } catch (e) {
      setError(String(e));
    } finally {
      pending.current.delete(id);
      setWorking(false);
    }
  };
  const ask = (d: EditorDocument, action: 'close' | 'reload') => {
    const id = documentID(d.root, d.path);
    if (dirtyDocument(d)) setConfirm({ id, action });
    else void perform(id, action);
  };
  const previewPage = async (id: string, offset: number) => {
    const d = docs.current.find((d) => documentID(d.root, d.path) === id);
    if (!d?.preview || pending.current.size) return;
    pending.current.add(id);
    setWorking(true);
    try {
      const preview = await Git.editorPreview(d.root, d.path, offset);
      update(docs.current.map((item) => (item === d ? { ...d, preview } : item)));
      setError('');
    } catch (e) {
      setError(String(e));
    } finally {
      pending.current.delete(id);
      setWorking(false);
    }
  };
  return (
    <div className="editor-workspace" hidden={!visible}>
      <ResizableSplit
        className="editor-layout"
        name="editor"
        label="调整文件树与编辑器宽度"
        initial={0.24}
        minFirst={180}
        minSecond={320}
      >
        {native ? (
          <FileTree
            key={snapshot.root}
            root={snapshot.root}
            selected={selected?.path}
            onOpen={(p) => void open(p)}
          />
        ) : (
          <section className="editor-explorer">
            <p className="editor-tree-note">请在桌面应用中打开仓库以浏览和编辑文件。</p>
          </section>
        )}
        <section className="editor-main" aria-label="代码编辑器">
          <form
            className="editor-path-bar"
            onSubmit={(e) => {
              e.preventDefault();
              if (path.trim()) void open(path.trim());
            }}
          >
            <FileCode2 size={16} />
            <input
              aria-label="仓库相对文件路径"
              placeholder="输入路径打开文件，例如 src/App.tsx"
              value={path}
              onChange={(e) => setPath(e.target.value)}
            />
            <button className="button compact" disabled={working || !path.trim()}>
              打开
            </button>
          </form>
          <div className="editor-tabs" role="tablist" aria-label="打开的文件">
            {opened.map((d) => {
              const id = documentID(d.root, d.path);
              return (
                <div className={`editor-tab ${id === selectedID ? 'active' : ''}`} key={id}>
                  <button
                    role="tab"
                    aria-selected={id === selectedID}
                    title={d.path}
                    onClick={() => {
                      setActive(id);
                      setCursor({ line: 1, column: 1 });
                    }}
                  >
                    <FileCode2 size={13} />
                    {d.path.split('/').at(-1)}
                    {dirtyDocument(d) && <span aria-label="未保存">●</span>}
                  </button>
                  <button
                    aria-label={`关闭 ${d.path}`}
                    disabled={working}
                    onClick={() => ask(d, 'close')}
                  >
                    <X size={12} />
                  </button>
                </div>
              );
            })}
          </div>
          {cacheError && (
            <div className="editor-warning" role="alert">
              {cacheError}
            </div>
          )}
          {error && <ErrorDetails message={error} />}
          {selected ? (
            <>
              <div className="editor-toolbar">
                <code title={selected.path}>{selected.path}</code>
                <button
                  className="button compact"
                  disabled={working || busy || !dirtyDocument(selected)}
                  onClick={() => void save(selectedID)}
                >
                  <Save size={13} />
                  保存
                </button>
                <button
                  className="button compact"
                  disabled={working}
                  onClick={() => ask(selected, 'reload')}
                >
                  重新读取
                </button>
                <button
                  className="button compact"
                  disabled={!!selected.preview}
                  onClick={() =>
                    setSearchRequest({
                      id: selectedID,
                      sequence: (searchRequest?.sequence || 0) + 1,
                    })
                  }
                >
                  查找 / 替换
                </button>
                <button className="button compact" onClick={() => onDiff(selected.path)}>
                  查看 Diff
                </button>
              </div>
              {external[selectedID] && (
                <div className="editor-warning" role="status">
                  磁盘文件已变化或不可读取。当前编辑内容保留，保存不会强制覆盖；请先复制需要的内容，再重新读取。
                </div>
              )}
            </>
          ) : (
            <div className="editor-empty">
              <FileCode2 size={32} />
              <h2>在这里写代码</h2>
              <p>从左侧选择文件，或输入仓库相对路径。保存只更新工作区，不自动暂存或提交。</p>
              <span>⌘ / Ctrl + S 保存 · ⌘ / Ctrl + F 查找 · Ctrl + Space 基础补全</span>
            </div>
          )}
          {documents.map((d) => {
            const id = documentID(d.root, d.path);
            return (
              <div
                className="editor-document"
                hidden={id !== selectedID}
                key={`${id}:${epochs[id] || 0}`}
              >
                {d.preview ? (
                  id === selectedID && visible ? (
                    <BinaryViewer
                      preview={d.preview}
                      loading={working}
                      onPage={(offset) => void previewPage(id, offset)}
                    />
                  ) : null
                ) : (
                  <EditorSurface
                    searchRequest={searchRequest?.id === id ? searchRequest.sequence : undefined}
                    path={d.path}
                    content={d.content}
                    visible={visible && id === selectedID}
                    onSave={() => void save(id)}
                    onChange={(content) =>
                      update(
                        docs.current.map((item) =>
                          documentID(item.root, item.path) === id ? { ...item, content } : item,
                        ),
                      )
                    }
                    onCursor={(line, column) => {
                      if (id === selectedID) setCursor({ line, column });
                    }}
                    onLanguageError={() =>
                      setError(`语言组件加载失败：${d.path}。仍可按纯文本编辑和保存。`)
                    }
                  />
                )}
              </div>
            );
          })}
          <footer className="editor-status">
            <span>
              {selected?.preview
                ? '二进制 · 只读预览'
                : selected
                  ? `Ln ${cursor.line}, Col ${cursor.column} · UTF-8 · ${selected.content.includes('\r\n') ? 'CRLF' : 'LF'}`
                  : 'CodeMirror 6 · 本地编辑'}
            </span>
            <span>
              {documents.filter(dirtyDocument).length} 个未保存（跨仓库） · 保存前自动备份 ·
              不自动暂存
            </span>
          </footer>
        </section>
      </ResizableSplit>
      {confirm && (
        <Dialog onClose={() => !working && setConfirm(null)}>
          <h2 id="modal-title">放弃此文件未保存的编辑？</h2>
          <p className="modal-description">
            {confirm.id}{' '}
            的当前编辑及其缓存草稿将被丢弃。磁盘文件不会因此被修改。请先保存或复制需要保留的内容。
          </p>
          <div className="modal-actions">
            <button className="button" disabled={working} onClick={() => setConfirm(null)}>
              继续编辑
            </button>
            <button
              className="button primary"
              disabled={working}
              onClick={() => void perform(confirm.id, confirm.action)}
            >
              {confirm.action === 'reload' ? '放弃编辑并重新读取' : '放弃编辑并关闭'}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

async function readDocument(root: string, path: string): Promise<EditorDocument> {
  try {
    const d = await Git.editorFile(root, path);
    return { root, path: d.path, content: d.content, original: d.content, revision: d.revision };
  } catch (textError) {
    try {
      const preview = await Git.editorPreview(root, path, 0);
      return { root, path: preview.path, content: '', original: '', revision: '', preview };
    } catch {
      throw textError;
    }
  }
}
