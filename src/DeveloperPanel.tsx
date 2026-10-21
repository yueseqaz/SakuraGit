import { useEffect, useState } from 'react';
import { isMyGo } from 'mygo-runtime';
import { Play, Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import {
  Git,
  type DeveloperConfig,
  type Environment,
  type QuickCommand,
  type Variable,
} from './mygo';
import { ErrorDetails } from './ErrorDetails';
import './developer.css';

const variableText = (variables: Variable[]) =>
  variables.map((v) => `${v.name}=${v.value}`).join('\n');
export function parseVariables(text: string): Variable[] {
  const seen = new Set<string>();
  return text
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      const split = line.indexOf('=');
      const name = line.slice(0, split).trim();
      if (split < 1 || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || seen.has(name.toUpperCase()))
        throw new Error('每行填写一个 KEY=value，名称不能重复。');
      seen.add(name.toUpperCase());
      return { name, value: line.slice(split + 1) };
    });
}

export function DeveloperPanel({
  root,
  onClose,
  onStarted,
  initialTab = 'commands',
}: {
  root: string;
  onClose: () => void;
  onStarted: () => void;
  initialTab?: 'commands' | 'environment';
}) {
  const [tab, setTab] = useState(initialTab);
  const [config, setConfig] = useState<DeveloperConfig | null>(null);
  const [environment, setEnvironment] = useState<Environment | null>(null);
  const [variables, setVariables] = useState('');
  const [editing, setEditing] = useState<QuickCommand | null>(null);
  const [confirm, setConfirm] = useState<QuickCommand | null>(null);
  const [working, setWorking] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  useEffect(() => {
    let alive = true;
    if (!isMyGo()) {
      setError('请在桌面应用中配置开发环境和快捷命令。');
      return;
    }
    setDetecting(true);
    void Git.developerConfig(root)
      .then((c) => {
        if (alive) {
          setConfig(c);
          setVariables(variableText(c.variables || []));
        }
      })
      .catch((e) => {
        if (alive) setError(String(e));
      });
    void Git.developmentEnvironment(root, false)
      .then((e) => {
        if (alive) setEnvironment(e);
      })
      .catch((e) => {
        if (alive) setError(String(e));
      })
      .finally(() => {
        if (alive) setDetecting(false);
      });
    return () => {
      alive = false;
    };
  }, [root]);
  const refresh = async (fresh: boolean) => {
    setDetecting(true);
    try {
      setEnvironment(await Git.developmentEnvironment(root, fresh));
    } catch (e) {
      setError(String(e));
    } finally {
      setDetecting(false);
    }
  };
  const save = async (next: DeveloperConfig) => {
    setWorking(true);
    setError('');
    setStatus('');
    try {
      await Git.saveDeveloperConfig(root, next);
      setConfig(next);
      setStatus('已保存到本机，仅此仓库生效。');
      return true;
    } catch (e) {
      setError(String(e));
      return false;
    } finally {
      setWorking(false);
    }
  };
  const add = (name = '', command = '') => {
    setEditing({ id: crypto.randomUUID(), name, command, directory: '' });
    setConfirm(null);
    setStatus('');
  };
  const launch = async () => {
    if (!confirm || working) return;
    setWorking(true);
    setError('');
    try {
      await Git.runDeveloperCommand(root, confirm);
      onStarted();
    } catch (e) {
      setError(String(e));
    } finally {
      setWorking(false);
    }
  };
  const environmentDirty = !!config && variables !== variableText(config.variables || []);
  return (
    <div className="developer-panel">
      <div className="modal-kicker">SAKURAGIT / LOCAL DEVELOPMENT</div>
      <h2 id="modal-title">环境就绪，一键开工。</h2>
      <p className="modal-description">
        配置只保存在本机，不写入仓库。命令使用检测到的 Shell，在底部独立终端运行，不会自动启动。
      </p>
      <code className="developer-root">{root}</code>
      <div className="developer-tabs" role="tablist" aria-label="开发配置">
        <button
          className={`button ${tab === 'commands' ? 'selected' : ''}`}
          role="tab"
          aria-selected={tab === 'commands'}
          onClick={() => setTab('commands')}
        >
          快捷命令
        </button>
        <button
          className={`button ${tab === 'environment' ? 'selected' : ''}`}
          role="tab"
          aria-selected={tab === 'environment'}
          onClick={() => setTab('environment')}
        >
          开发环境
        </button>
      </div>
      {error && <ErrorDetails message={error} />}
      {status && (
        <p role="status" className="developer-status">
          {status}
        </p>
      )}
      {!config && !error && <p>正在读取本机配置…</p>}
      {tab === 'commands' && config && (
        <>
          <div className="developer-heading">
            <strong>
              此仓库的启动入口 <small>{config.commands.length} / 30</small>
            </strong>
            <button
              className="button compact"
              disabled={working || !!editing}
              onClick={() => add()}
            >
              <Plus size={14} />
              新建命令
            </button>
          </div>
          {!config.commands.length && !editing && (
            <div className="developer-presets">
              <p>还没有快捷命令。选一个模板，检查后保存：</p>
              {[
                ['Node 开发', 'npm run dev'],
                ['Go 运行', 'go run .'],
                ['Spring Boot', './mvnw spring-boot:run'],
                ['PHP 本地服务', 'php -S 127.0.0.1:8000 -t public'],
              ].map(([name, command]) => (
                <button className="button compact" key={name} onClick={() => add(name, command)}>
                  {name}
                </button>
              ))}
            </div>
          )}
          {config.commands.map((command) => (
            <article className="developer-command" key={command.id}>
              <div>
                <strong>{command.name}</strong>
                <small>{command.directory || '仓库根目录'}</small>
                <pre>{command.command}</pre>
              </div>
              <div className="developer-command-actions">
                <button
                  className="button compact primary"
                  disabled={working || environmentDirty || !!editing || detecting}
                  onClick={() => setConfirm(command)}
                >
                  <Play size={13} />
                  运行
                </button>
                <button
                  className="button compact"
                  disabled={working}
                  onClick={() => {
                    setEditing({ ...command });
                    setConfirm(null);
                  }}
                >
                  编辑
                </button>
              </div>
            </article>
          ))}
          {environmentDirty && (
            <p className="developer-warning">
              环境变量有未保存的修改，请先保存或还原后再运行命令。
            </p>
          )}
          {editing && (
            <form
              className="developer-form"
              onSubmit={async (e) => {
                e.preventDefault();
                const next = [...config.commands.filter((c) => c.id !== editing.id), editing];
                if (await save({ ...config, commands: next })) setEditing(null);
              }}
            >
              <label>
                命令名称
                <input
                  required
                  maxLength={100}
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="例如：启动后端"
                />
              </label>
              <label>
                工作目录
                <input
                  value={editing.directory}
                  onChange={(e) => setEditing({ ...editing, directory: e.target.value })}
                  placeholder="留空为仓库根目录，例如 server"
                />
              </label>
              <label>
                Shell 命令
                <textarea
                  required
                  maxLength={16384}
                  rows={4}
                  spellCheck={false}
                  value={editing.command}
                  onChange={(e) => setEditing({ ...editing, command: e.target.value })}
                  placeholder="例如 npm run dev"
                />
              </label>
              <p className="theme-note">
                支持参数、管道与多行脚本。会以你的账号权限执行，只添加可信命令。Windows 使用
                PowerShell 语法。
              </p>
              <div className="modal-actions">
                <button
                  type="button"
                  className="button"
                  disabled={working}
                  onClick={() => setEditing(null)}
                >
                  取消编辑
                </button>
                {config.commands.some((c) => c.id === editing.id) && (
                  <button
                    type="button"
                    className="button"
                    disabled={working}
                    onClick={async () => {
                      if (
                        await save({
                          ...config,
                          commands: config.commands.filter((c) => c.id !== editing.id),
                        })
                      )
                        setEditing(null);
                    }}
                  >
                    <Trash2 size={13} />
                    删除配置
                  </button>
                )}
                <button className="button primary" disabled={working}>
                  <Save size={13} />
                  保存命令
                </button>
              </div>
            </form>
          )}
          {confirm && (
            <section className="developer-confirm" aria-label="确认运行命令">
              <strong>运行「{confirm.name}」？</strong>
              <p>
                工作目录：{confirm.directory || '仓库根目录'} · Shell：
                {environment?.shell || '系统 Shell'}
              </p>
              <pre>{confirm.command}</pre>
              <p>
                命令可修改文件、访问网络和启动服务。未保存的编辑不会自动写入；终端中 Ctrl+C
                停止程序，关闭会话仍需确认。
              </p>
              <div className="modal-actions">
                <button className="button" disabled={working} onClick={() => setConfirm(null)}>
                  暂不运行
                </button>
                <button
                  className="button primary"
                  disabled={working || environmentDirty || detecting}
                  onClick={() => void launch()}
                >
                  {working ? '正在启动…' : '确认并在终端运行'}
                </button>
              </div>
            </section>
          )}
        </>
      )}
      {tab === 'environment' && (
        <>
          <div className="developer-heading">
            <strong>工具链检测</strong>
            <button
              className="button compact"
              disabled={detecting || working}
              onClick={() => void refresh(true)}
            >
              <RefreshCw size={13} className={detecting ? 'spin' : ''} />
              {detecting ? '正在检测…' : '重新读取环境'}
            </button>
          </div>
          <p className="theme-note">
            macOS / Linux 读取登录 Shell（可能执行你自己的 Shell 启动配置）；Windows
            读取用户与系统环境。只在主目录检测工具版本，不读取项目 .env，不安装软件。
          </p>
          {environment?.warning && <p className="developer-warning">{environment.warning}</p>}
          {environment && (
            <>
              <p className="theme-note">
                来源：{environment.source} · {environment.shell}
              </p>
              <div className="developer-tools">
                {environment.tools.map((tool) => (
                  <article key={tool.name}>
                    <strong>{tool.name}</strong>
                    <span>{tool.path ? tool.version || '已找到' : '未找到'}</span>
                    <code title={tool.path}>
                      {tool.path || '请安装，或补充 PATH / JAVA_HOME / GOROOT'}
                    </code>
                  </article>
                ))}
              </div>
              <details>
                <summary>查看已读取的开发环境变量</summary>
                {environment.variables.map((v) => (
                  <p className="developer-variable" key={v.name}>
                    <b>{v.name}</b>
                    <code>{v.value}</code>
                  </p>
                ))}
              </details>
            </>
          )}
          {config && (
            <form
              className="developer-form"
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  if (await save({ ...config, variables: parseVariables(variables) }))
                    void refresh(false);
                } catch (error) {
                  setError(String(error));
                }
              }}
            >
              <label>
                此仓库的环境变量覆盖
                <textarea
                  rows={5}
                  value={variables}
                  spellCheck={false}
                  onChange={(e) => setVariables(e.target.value)}
                  placeholder={'JAVA_HOME=/path/to/jdk\nPATH=/your/tool/bin:/usr/bin:/bin'}
                />
              </label>
              <p className="theme-note">
                每行 KEY=value，值按字面使用，不展开 $PATH、%PATH% 或 ~。PATH
                请填写完整路径列表。仅新建终端 / 新运行的命令生效；不会修改系统配置。
              </p>
              <p className="developer-warning">
                自定义值以本机文件明文保存，不建议填写密码或
                Token。此处不会枚举或展示其他继承的敏感变量。
              </p>
              <div className="modal-actions">
                <button
                  className="button"
                  type="button"
                  disabled={working}
                  onClick={() => setVariables(variableText(config.variables || []))}
                >
                  还原未保存修改
                </button>
                <button className="button primary" disabled={working || !environmentDirty}>
                  <Save size={13} />
                  保存环境变量
                </button>
              </div>
            </form>
          )}
        </>
      )}
      <div className="modal-actions">
        <button className="button" disabled={working} onClick={onClose}>
          完成
        </button>
      </div>
    </div>
  );
}
