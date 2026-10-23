import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  CheckCircle2,
  ArrowUp,
  ArrowDown,
  Code2,
  FileCode2,
  LoaderCircle,
  Maximize2,
  Minus,
  Plus,
  WrapText,
  XCircle,
} from 'lucide-react';
import type { Diff, File, Snapshot } from './mygo';
import { parseDiff, splitDiff, type DiffLine } from './git-view';
import { Dialog } from './Dialog';
import { useDiffHighlight } from './useDiffHighlight';

export type Selection =
  | { kind: 'file'; path: string; staged: boolean }
  | { kind: 'commit'; hash: string }
  | { kind: 'stash'; hash: string }
  | null;
type Options = { mode: 'unified' | 'split'; wrap: boolean; metadata: boolean };
const optionsKey = 'gitlane.diff-view.v1';
function initialOptions(): Options {
  try {
    const value = JSON.parse(localStorage.getItem(optionsKey) || 'null');
    return {
      mode: value?.mode === 'split' ? 'split' : 'unified',
      wrap: value?.wrap !== false,
      metadata: value?.metadata === true,
    };
  } catch {
    return { mode: 'unified', wrap: true, metadata: false };
  }
}
const basename = (path: string) => path.split('/').at(-1) || path;

export function DiffPanel({
  diff,
  loading,
  error,
  selection,
  snapshot,
  onStage,
  onHunk,
  onLines,
  readonlyTitle,
  disabled,
  codeSize,
  onCodeSize,
  onEdit,
}: {
  diff: Diff | null;
  loading: boolean;
  error: string;
  selection: Selection;
  snapshot: Snapshot;
  onStage: (files: File[], stage: boolean) => void;
  onHunk?: (id: number) => void;
  onLines?: (positions: number[]) => void;
  readonlyTitle?: string;
  disabled: boolean;
  codeSize: number;
  onCodeSize: (size: number) => void;
  onEdit?: () => void;
}) {
  const [options, setOptions] = useState(initialOptions);
  const [focused, setFocused] = useState(false);
  const focusButton = useRef<HTMLButtonElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const diffKey = `${snapshot.root}:${diff?.path}:${diff?.revision}:${selection?.kind === 'file' ? selection.staged : ''}`;
  const [lineSelection, setLineSelection] = useState<{ key: string; positions: number[] }>({
    key: '',
    positions: [],
  });
  const selectedLines = lineSelection.key === diffKey ? lineSelection.positions : [];
  const [location, setLocation] = useState({ key: '', index: -1 });
  const currentHunk = location.key === diffKey ? location.index : -1;
  const navigate = (direction: number) => {
    const hunks = scroll.current?.querySelectorAll<HTMLElement>('.diff-hunk');
    if (!hunks?.length) return;
    const index =
      currentHunk < 0
        ? direction > 0
          ? 0
          : hunks.length - 1
        : (currentHunk + direction + hunks.length) % hunks.length;
    hunks[index].scrollIntoView?.({ block: 'center', behavior: 'auto' });
    setLocation({ key: diffKey, index });
  };
  const position = useRef({ top: 0, left: 0 });
  const wasFocused = useRef(false);
  const changeFocus = (value: boolean) => {
    position.current = {
      top: scroll.current?.scrollTop || 0,
      left: scroll.current?.scrollLeft || 0,
    };
    setFocused(value);
  };
  useLayoutEffect(() => {
    if (scroll.current) {
      scroll.current.scrollTop = position.current.top;
      scroll.current.scrollLeft = position.current.left;
    }
    if (!focused && wasFocused.current) focusButton.current?.focus({ preventScroll: true });
    wasFocused.current = focused;
  }, [focused]);
  const titleId = useId();
  useEffect(() => {
    try {
      localStorage.setItem(optionsKey, JSON.stringify(options));
    } catch {
      /* Reading remains available without storage. */
    }
  }, [options]);
  const lines = useMemo(() => parseDiff(diff?.text || '', 3001), [diff?.text]);
  const visible = useMemo(() => lines.slice(0, 3000), [lines]);
  const rows = useMemo(() => splitDiff(visible), [visible]);
  const linePositions = useMemo(() => new Map(visible.map((line, i) => [line, i])), [visible]);
  const chooseLine = (line?: DiffLine) => {
    if (!onLines || !diff?.hunks.length) return null;
    if (!line || !['add', 'remove'].includes(line.kind))
      return <span className="line-picker-placeholder" />;
    const index = linePositions.get(line)!;
    return (
      <input
        className="line-picker"
        type="checkbox"
        aria-label={`选择${line.kind === 'add' ? `新第 ${line.next} 行新增` : `原第 ${line.old} 行删除`}`}
        checked={selectedLines.includes(index)}
        disabled={disabled || loading}
        onChange={() => {
          setLineSelection({
            key: diffKey,
            positions: selectedLines.includes(index)
              ? selectedLines.filter((i) => i !== index)
              : [...selectedLines, index],
          });
        }}
      />
    );
  };
  const { spans: highlights, mode: highlightMode } = useDiffHighlight(visible, diff?.path || '');
  const code = (line: DiffLine) =>
    highlights.get(line)?.map((span, i) => (
      <span
        key={i}
        className={`${span.type ? `token syntax-${span.type}` : ''}${span.changed ? ' word-change' : ''}`}
      >
        {span.text}
      </span>
    )) || line.text.slice(1);
  const file =
    selection?.kind === 'file' ? snapshot.files.find((f) => f.path === selection.path) : null;
  const commit =
    selection?.kind === 'commit' ? snapshot.commits.find((c) => c.hash === selection.hash) : null;
  const title = file
    ? basename(file.path)
    : diff?.path && !readonlyTitle
      ? basename(diff.path)
      : readonlyTitle || '文件差异';
  const path = file?.path || (readonlyTitle ? readonlyTitle : diff?.path) || commit?.subject || '';
  const before =
    selection?.kind === 'file'
      ? selection.staged
        ? 'HEAD'
        : '暂存区'
      : readonlyTitle
        ? '保存前'
        : '父提交';
  const after =
    selection?.kind === 'file'
      ? selection.staged
        ? '暂存区'
        : '工作区'
      : readonlyTitle
        ? 'Stash'
        : '当前提交';
  const multipleFiles = lines.filter((l) => l.text.startsWith('diff --git ')).length > 1;
  const hasCode = lines.some((l) => l.kind === 'hunk');
  const showMeta = (line: DiffLine) =>
    options.metadata ||
    !hasCode ||
    line.text.startsWith('\\') ||
    (multipleFiles && line.text.startsWith('diff --git '));
  const hunk = (line: DiffLine, index: number) => {
    const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)/.exec(line.text);
    const action = diff?.hunks.find((h) => h.line === index);
    return (
      <div
        className={`diff-hunk diff-line hunk ${visible.filter((l, i) => i < index && l.kind === 'hunk').length === currentHunk ? 'active-hunk' : ''}`}
        key={index}
      >
        <span className="hunk-location">
          {match ? `原 ${match[1]} 行 → 新 ${match[3]} 行` : line.text}
        </span>
        {match?.[5] && <code className="hunk-context">{match[5].trim()}</code>}
        {action && onHunk && (
          <button
            type="button"
            className="hunk-action"
            disabled={disabled || loading}
            onClick={() => onHunk(action.id)}
          >
            {selection?.kind === 'file' && selection.staged ? '取消暂存此块' : '暂存此块'}
          </button>
        )}
      </div>
    );
  };
  const meta = (line: DiffLine, index: number) =>
    showMeta(line) ? (
      <div className="diff-line meta" key={index}>
        <code>{line.text || ' '}</code>
      </div>
    ) : null;
  const cell = (line: DiffLine | undefined, side: 'left' | 'right') => (
    <div className={`split-cell ${line?.kind || 'blank'}`}>
      {chooseLine(line)}
      <span className="line-number">{side === 'left' ? line?.old : line?.next}</span>
      <span className="line-symbol">
        {line?.kind === 'add' ? '+' : line?.kind === 'remove' ? '−' : ''}
      </span>
      <code>{line ? code(line) : ' '}</code>
    </div>
  );
  const panel = (
    <section
      className={`diff-panel diff-reader ${options.wrap ? 'wrap-lines' : ''} ${focused ? 'is-focused' : ''}`}
      data-highlight-mode={highlightMode}
      aria-label="差异详情"
      onKeyDown={(event) => {
        if (event.key === 'F7') {
          event.preventDefault();
          navigate(event.shiftKey ? -1 : 1);
        }
      }}
    >
      <div className="diff-reader-heading">
        {onEdit && (
          <button className="button compact" disabled={disabled} onClick={onEdit}>
            编辑工作文件
          </button>
        )}
        <FileCode2 size={17} />
        <div className="diff-file-identity">
          <strong id={titleId}>{title}</strong>
          <span title={path}>{path}</span>
        </div>
        <span className="diff-counts">
          <span>
            +{lines.filter((l) => l.kind === 'add').length}
            {lines.length > 3000 ? '+' : ''}
          </span>
          <span>
            −{lines.filter((l) => l.kind === 'remove').length}
            {lines.length > 3000 ? '+' : ''}
          </span>
        </span>
        {file && selection?.kind === 'file' && (
          <button
            type="button"
            className="button compact"
            disabled={disabled || loading}
            onClick={() => onStage([file], !selection.staged)}
          >
            {selection.staged ? <Minus size={13} /> : <Plus size={13} />}
            <span>{selection.staged ? '取消暂存' : '暂存文件'}</span>
          </button>
        )}
        {!focused && (
          <button
            type="button"
            className="icon-button focus-diff"
            ref={focusButton}
            aria-label="专注阅读差异"
            title="专注阅读差异"
            onClick={() => changeFocus(true)}
          >
            <Maximize2 size={16} />
          </button>
        )}
      </div>
      <div className="diff-reading-tools" aria-label="差异阅读选项">
        <div className="diff-navigation" role="group" aria-label="改动导航">
          <button
            type="button"
            title="上一个改动 / Shift+F7"
            aria-label="上一个改动"
            disabled={!hasCode || loading}
            onClick={() => navigate(-1)}
          >
            <ArrowUp size={13} />
          </button>
          <span>
            {currentHunk < 0 ? '改动' : currentHunk + 1} /{' '}
            {visible.filter((l) => l.kind === 'hunk').length}
          </span>
          <button
            type="button"
            title="下一个改动 / F7"
            aria-label="下一个改动"
            disabled={!hasCode || loading}
            onClick={() => navigate(1)}
          >
            <ArrowDown size={13} />
          </button>
        </div>
        <div className="diff-mode-switch" role="group" aria-label="对比方式">
          <button
            type="button"
            aria-pressed={options.mode === 'unified'}
            onClick={() => setOptions({ ...options, mode: 'unified' })}
          >
            统一
          </button>
          <button
            type="button"
            aria-pressed={options.mode === 'split'}
            onClick={() => setOptions({ ...options, mode: 'split' })}
          >
            并排
          </button>
        </div>
        <span className="diff-compare-label">
          {before} <span>→</span> {after}
        </span>
        <div className="diff-reading-actions">
          <select
            aria-label="差异字号"
            title="代码字号，自动保存"
            value={codeSize}
            onChange={(e) => onCodeSize(Number(e.target.value))}
          >
            {[12, 14].map((size) => (
              <option key={size} value={size}>
                {size} px
              </option>
            ))}
          </select>
          <button
            type="button"
            aria-pressed={options.wrap}
            title="自动换行，不改变文件内容"
            onClick={() => setOptions({ ...options, wrap: !options.wrap })}
          >
            <WrapText size={14} />
            <span>换行</span>
          </button>
          <button
            type="button"
            aria-pressed={options.metadata}
            onClick={() => setOptions({ ...options, metadata: !options.metadata })}
          >
            差异元信息
          </button>
        </div>
      </div>
      {onLines && !!diff?.hunks.length && (
        <div className="line-selection-toolbar">
          <span>{selectedLines.length ? `已选 ${selectedLines.length} 行` : '未选择行'}</span>
          <button
            className="button compact"
            disabled={disabled || loading || !selectedLines.length}
            onClick={() => onLines([...selectedLines].sort((a, b) => a - b))}
          >
            {selection?.kind === 'file' && selection.staged ? '取消暂存所选行' : '暂存所选行'}
          </button>
          {!!selectedLines.length && (
            <button
              className="button compact"
              onClick={() => setLineSelection({ key: diffKey, positions: [] })}
            >
              清空选择
            </button>
          )}
        </div>
      )}
      <div
        className="diff-scroll"
        ref={scroll}
        key={`${snapshot.root}:${diff?.path || ''}:${selection?.kind === 'file' ? selection.staged : ''}:${options.mode}`}
      >
        {loading ? (
          <Message
            icon={<LoaderCircle className="spin" />}
            title="正在读取变更"
            text="从本地 Git 获取文件差异…"
          />
        ) : error ? (
          <Message icon={<XCircle />} title="暂时无法读取" text={error} />
        ) : !selection ? (
          <Message
            icon={<Code2 />}
            title="选择文件，开始审阅"
            text="左侧选择一个文件，在这里查看修改前后的代码。"
          />
        ) : diff?.binary ? (
          <Message
            icon={<FileCode2 />}
            title="这是一个二进制文件"
            text="无法显示文本差异；文件仍包含在这次变更中。"
          />
        ) : !diff?.text ? (
          <Message
            icon={<CheckCircle2 />}
            title="没有可显示的文本差异"
            text="可能是空文件、文件模式或子模块变化，请检查 Git 状态。"
          />
        ) : (
          <div
            className={`diff-code ${options.mode === 'split' ? 'split-code' : ''}`}
            role="region"
            aria-label={options.mode === 'split' ? '并排差异视图' : '统一差异视图'}
            tabIndex={0}
          >
            {options.mode === 'split' && (
              <div className="split-column-labels">
                <span>{before} / 修改前</span>
                <span>{after} / 修改后</span>
              </div>
            )}
            {options.mode === 'split'
              ? rows.map((row) =>
                  row.kind === 'hunk' ? (
                    hunk(row.line, row.index)
                  ) : row.kind === 'meta' ? (
                    meta(row.line, row.index)
                  ) : (
                    <div className="split-row diff-line" key={row.index}>
                      {cell(row.left, 'left')}
                      {cell(row.right, 'right')}
                    </div>
                  ),
                )
              : visible.map((line, i) =>
                  line.kind === 'hunk' ? (
                    hunk(line, i)
                  ) : line.kind === 'meta' ? (
                    meta(line, i)
                  ) : (
                    <div className={`diff-line ${line.kind}`} key={i}>
                      {chooseLine(line)}
                      <span className="line-number">{line.old}</span>
                      <span className="line-number">{line.next}</span>
                      <span className="line-symbol">
                        {line.kind === 'add' ? '+' : line.kind === 'remove' ? '−' : ''}
                      </span>
                      <code>{code(line)}</code>
                    </div>
                  ),
                )}
            {lines.length > visible.length && (
              <div className="diff-truncated">仅显示前 3000 行，完整变更请在终端查看。</div>
            )}
          </div>
        )}
      </div>
      {hasCode && (focused || highlightMode === 'plain') && (
        <div className="diff-footer">
          <span>{focused ? 'Esc 退出专注阅读' : ''}</span>
          <span>{highlightMode === 'plain' ? '纯文本' : ''}</span>
        </div>
      )}
    </section>
  );
  return focused ? (
    <Dialog onClose={() => changeFocus(false)} className="diff-focus-modal" labelledBy={titleId}>
      {panel}
    </Dialog>
  ) : (
    panel
  );
}

function Message({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="empty-state">
      <span className="empty-icon">{icon}</span>
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}
