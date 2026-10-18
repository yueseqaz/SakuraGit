import { useEffect, useState } from 'react';
import { isMyGo } from 'mygo-runtime';
import { Git, type OperationStatus } from './mygo';
import { redactGitError } from './ErrorDetails';
export function OperationBar({ busy, hidden }: { busy: string; hidden: boolean }) {
  const [status, setStatus] = useState<OperationStatus | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const [canceling, setCanceling] = useState(false);
  useEffect(() => {
    if (!busy || !isMyGo()) {
      setStatus(null);
      return;
    }
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    setStatus(null);
    setCanceling(false);
    setError('');
    setElapsed(0);
    let tracked = '';
    const poll = async () => {
      try {
        const next = await Git.operationStatus();
        if (
          active &&
          next.id &&
          (next.id === tracked || next.state === 'running' || next.state === 'canceling')
        ) {
          tracked = next.id;
          setStatus(next);
          setElapsed(Math.max(0, Math.floor((Date.now() - next.startedAt) / 1000)));
        }
      } catch {
        /* The operation itself reports failures; polling must not manufacture a result. */
      }
      if (active) timer = setTimeout(() => void poll(), 350);
    };
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [busy]);
  if (!busy || !status || hidden) return null;
  const cancel = async () => {
    setCanceling(true);
    try {
      await Git.cancelOperation(status.id);
    } catch (e) {
      setError(String(e));
      setCanceling(false);
    }
  };
  return (
    <aside className="operation-progress" aria-label="当前操作进度">
      <div>
        <strong>
          {busy} · {canceling ? '正在停止…' : status.phase}
        </strong>
        <span>{elapsed}s</span>
      </div>
      <progress
        max={100}
        value={status.percent >= 0 ? status.percent : undefined}
        aria-label="操作阶段进度"
      />
      <small>
        {status.percent >= 0
          ? `当前阶段 ${status.percent}% · 非整体进度`
          : '等待 Git / hooks 或服务器返回，不使用假百分比'}
      </small>
      {status.detail && <pre>{redactGitError(status.detail)}</pre>}
      <button
        className="button compact"
        disabled={canceling || status.state !== 'running'}
        onClick={() => void cancel()}
      >
        取消当前操作
      </button>
      <p>取消不等于回滚；结束后会重新检查仓库。</p>
      {error && <p role="alert">{error}</p>}
    </aside>
  );
}
