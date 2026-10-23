import { useEffect, useRef, useState } from 'react';
import { isMyGo } from 'mygo-runtime';
import { LoaderCircle, Terminal } from 'lucide-react';
import { Workbench, onTerminalDockChanged } from './workbench-api';

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
  const [visible, setVisible] = useState(false);
  const native = isMyGo();
  useEffect(() => {
    if (native && window.__SAKURAGIT_EMBEDDED__) return onTerminalDockChanged(setVisible);
  }, [native]);
  const launch = async () => {
    if (!native || !root || disabled || opening.current) return;
    opening.current = true;
    setLoading(true);
    try {
      await Workbench.toggleTerminal(root);
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
      aria-pressed={visible}
      title={
        native
          ? '展开 / 收起底部终端（Ctrl/Cmd + `）；收起后程序继续运行'
          : '内置终端仅在桌面应用中提供'
      }
      disabled={!native || !root || disabled || loading}
      onClick={() => void launch()}
    >
      {loading ? <LoaderCircle size={16} className="spin" /> : <Terminal size={16} />}
    </button>
  );
}
