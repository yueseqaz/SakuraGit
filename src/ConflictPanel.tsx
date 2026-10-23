import { useEffect, useMemo, useRef, useState } from 'react';
import { isMyGo } from 'mygo-runtime';
import { GitMerge, RefreshCw, Save, ShieldCheck } from 'lucide-react';
import { Workbench, type ConflictDetails } from './workbench-api';
import { conflictBlocks, hasConflictMarkers, resolveBlock } from './conflict-model';
import { ErrorDetails } from './ErrorDetails';
import { ResizableSplit } from './ResizableSplit';
import { Dialog } from './Dialog';
import type { Mutate } from './panel-types';

export function ConflictPanel({
  root,
  path,
  busy,
  run,
}: {
  root: string;
  path: string;
  busy: boolean;
  run: Mutate;
}) {
  const [details, setDetails] = useState<ConflictDetails | null>(null);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [cacheError, setCacheError] = useState(false);
  const [reload, setReload] = useState(0);
  const [confirm, setConfirm] = useState<'reload' | 'save' | null>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  const cacheKey = `gitlane.merge-draft.v1.${JSON.stringify([root, path])}`;
  useEffect(() => {
    let active = true;
    setDetails(null);
    setError('');
    if (!isMyGo()) {
      setError('请在桌面应用中处理真实冲突');
      return;
    }
    Workbench.conflict(root, path).then(
      (value) => {
        if (!active) return;
        let draft: { revision: string; result: string } | null = null;
        try {
          draft = JSON.parse(localStorage.getItem(cacheKey) || 'null');
        } catch {
          /* Read original file instead. */
        }
        if (draft && typeof draft.result === 'string' && typeof draft.revision === 'string') {
          setDetails({ ...value, revision: draft.revision });
          setResult(draft.result);
          if (draft.revision !== value.revision)
            setError(
              '已恢复未保存的合并草稿，但源文件或仓库已变化。请先复制草稿，再重新读取；不会覆盖外部修改。',
            );
        } else {
          setDetails(value);
          setResult(value.result);
        }
      },
      (e) => {
        if (active) setError(String(e));
      },
    );
    return () => {
      active = false;
    };
  }, [root, path, reload]);
  const edit = (text: string) => {
    setResult(text);
    try {
      localStorage.setItem(cacheKey, JSON.stringify({ revision: details?.revision, result: text }));
      setCacheError(false);
    } catch {
      setCacheError(true);
    }
  };
  const blocks = useMemo(() => conflictBlocks(result), [result]);
  const markers = hasConflictMarkers(result);
  const save = async () => {
    if (!details || markers) return;
    const chosen = { root, path, revision: details.revision, result };
    setConfirm(null);
    const ok = await run(
      '保存合并结果',
      (currentRoot) => {
        if (currentRoot !== chosen.root) throw new Error('仓库已切换，请重新确认');
        return Workbench.saveConflict(chosen.root, chosen.path, chosen.revision, chosen.result);
      },
      '合并结果已保存并暂存。当前流程尚未提交，请检查后继续流程。',
    );
    if (ok) {
      try {
        localStorage.removeItem(cacheKey);
      } catch {}
    }
  };
  return (
    <section className="merge-panel" aria-label="三方合并编辑器">
      <div className="merge-heading">
        <GitMerge size={17} />
        <strong title={path}>{path}</strong>
        <button className="button compact" disabled={busy} onClick={() => setConfirm('reload')}>
          <RefreshCw size={13} />
          重新读取
        </button>
        <button
          className="button primary compact"
          disabled={busy || !details || markers || !!error}
          onClick={() => setConfirm('save')}
        >
          <Save size={13} />
          保存并暂存
        </button>
      </div>
      {error && <ErrorDetails message={error} />}
      {cacheError && <p role="alert">合并草稿缓存不可用，请先复制结果，避免离开页面后丢失。</p>}
      {!details ? (
        <div className="empty-state">
          {error ? '可改用开发工具中的外部合并工具。' : '正在读取三方版本…'}
        </div>
      ) : (
        <>
          <p className="merge-context">
            <ShieldCheck size={13} />
            {details.state === 'rebase'
              ? 'Rebase 中：索引第 2 阶段是已变基目标，第 3 阶段是正在重放的提交，不能按日常“本地 / 远程”理解。'
              : '仅修改所选冲突块，保留 Git 已自动合并的其他内容。保存前备份原文件，并检查是否被外部修改。'}
          </p>
          <ResizableSplit
            className="merge-body"
            name="merge-editor"
            label="调整三方对照与结果编辑区高度"
            axis="vertical"
            initial={0.46}
            minFirst={100}
            minSecond={160}
          >
            <div className="merge-sources">
              <MergeSource title="共同祖先 / Base" text={details.base} />
              <MergeSource title="第 2 阶段 / Ours" text={details.ours} />
              <MergeSource title="第 3 阶段 / Theirs" text={details.theirs} />
            </div>
            <div className="merge-result">
              <div className="merge-result-heading">
                <strong>合并结果</strong>
                <span>
                  {markers
                    ? `${blocks.length} 个可识别冲突块 / 可手动编辑`
                    : '无冲突标记 / 请审阅结果再保存'}
                </span>
                <button
                  className="button compact"
                  onClick={() => {
                    const first = blocks[0];
                    if (first && editor.current) {
                      editor.current.focus();
                      editor.current.setSelectionRange(first.start, first.end);
                    }
                  }}
                  disabled={!blocks.length}
                >
                  定位首个冲突
                </button>
              </div>
              {!!blocks.length && (
                <div className="merge-block-actions">
                  {blocks.map((block, i) => (
                    <div key={block.start}>
                      <span>冲突 {i + 1}</span>
                      {(['ours', 'theirs', 'both'] as const).map((choice) => (
                        <button
                          className="button compact"
                          key={choice}
                          disabled={busy}
                          onClick={() => edit(resolveBlock(result, block, choice))}
                        >
                          {choice === 'ours'
                            ? '采用第 2 阶段'
                            : choice === 'theirs'
                              ? '采用第 3 阶段'
                              : '依次保留双方'}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              )}
              <textarea
                ref={editor}
                aria-label="合并结果代码"
                value={result}
                onChange={(e) => edit(e.target.value)}
                spellCheck={false}
                disabled={busy}
              />
            </div>
          </ResizableSplit>
        </>
      )}
      {confirm && (
        <Dialog onClose={() => !busy && setConfirm(null)}>
          <h2 id="modal-title">
            {confirm === 'save' ? '保存并标记已解决？' : '重新读取并放弃当前合并草稿？'}
          </h2>
          <p className="modal-description">
            {confirm === 'save'
              ? '将结果写入工作文件并暂存，不会自动创建提交。原始冲突文件会保存在本仓库的文件备份中。'
              : '仅丢弃这里尚未保存的草稿，不修改磁盘文件；如果需要保留，请先复制结果。'}
          </p>
          <code className="confirmation-path">{path}</code>
          <button
            className="button primary"
            disabled={busy}
            onClick={() => {
              if (confirm === 'save') void save();
              else {
                try {
                  localStorage.removeItem(cacheKey);
                } catch {}
                setConfirm(null);
                setReload((n) => n + 1);
              }
            }}
          >
            确认{confirm === 'save' ? '保存并暂存' : '重新读取'}
          </button>
        </Dialog>
      )}
    </section>
  );
}

function MergeSource({ title, text }: { title: string; text: string }) {
  return (
    <section>
      <h3>{title}</h3>
      <pre tabIndex={0} aria-label={title}>
        {text || '(空内容)'}
      </pre>
    </section>
  );
}
