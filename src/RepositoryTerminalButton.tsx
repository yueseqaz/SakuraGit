import { useEffect, useRef, useState } from 'react';
import { isMyGo } from 'mygo-runtime';
import { LoaderCircle, Terminal } from 'lucide-react';
import { Git } from './mygo';

export function RepositoryTerminalButton({
  root,
  disabled,
  onError,
}: {
  root?: string;
  disabled: boolean;
  onError: (error: unknown) => void;
}) {
  const opening = useRef(false);
  const [loading, setLoading] = useState(false);
  const native = isMyGo();
  const launch = async () => {
    if (!native || !root || disabled || opening.current) return;
    opening.current = true;
    setLoading(true);
    try {
      await Git.openDevelopmentPath(root, '', 'terminal', '');
    } catch (error) {
      onError(error);
    } finally {
      opening.current = false;
      setLoading(false);
    }
  };
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.altKey ||
        event.shiftKey ||
        !(event.ctrlKey || event.metaKey) ||
        event.code !== 'Backquote' ||
        document.querySelector('[role="dialog"]') ||
        !native ||
        !root ||
        disabled
      )
        return;
      event.preventDefault();
      void launch();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [root, disabled, native, onError]);
  return (
    <button
      className="button compact"
      aria-label="打开仓库内置终端"
      title={
        native
          ? '在当前仓库打开真实 Shell（Ctrl/Cmd + `）；命令不受 Git 按钮限制'
          : '内置终端仅在桌面应用中提供'
      }
      disabled={!native || !root || disabled || loading}
      onClick={() => void launch()}
    >
      {loading ? <LoaderCircle size={16} className="spin" /> : <Terminal size={16} />}
      {loading ? '启动中…' : '终端'}
    </button>
  );
}
