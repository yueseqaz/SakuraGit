import { useEffect, useState } from 'react';
import { isMyGo } from 'mygo-runtime';
import { Bot, Check, Play, Plus, RefreshCw, Save, Settings2, Sparkles, Trash2 } from 'lucide-react';
import {
  Git,
  type DeveloperConfig,
  type Environment,
  type AIProvider,
  type ProjectAnalysis,
  type ProjectProfile,
  type QuickCommand,
  type Variable,
} from './mygo';
import { ErrorDetails } from './ErrorDetails';

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
  const [working, setWorking] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [profile, setProfile] = useState<ProjectProfile | null>(null);
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [analysis, setAnalysis] = useState<ProjectAnalysis | null>(null);
  const [aiEditing, setAiEditing] = useState<AIProvider | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
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
    if (typeof Git.projectProfile === 'function') {
      void Git.projectProfile(root).then(setProfile).catch(() => undefined);
    }
    if (typeof Git.aiProviders === 'function') {
      void Git.aiProviders().then(setProviders).catch(() => undefined);
    }
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
      setStatus('已保存');
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
    setStatus('');
  };
  const launch = async (command: QuickCommand) => {
    if (working || environmentDirty || detecting || editing) return;
    setWorking(true);
    setError('');
    try {
      await Git.runDeveloperCommand(root, command);
      onStarted();
    } catch (e) {
      setError(String(e));
    } finally {
      setWorking(false);
    }
  };
  const environmentDirty = !!config && variables !== variableText(config.variables || []);
  const addDetected = (command: QuickCommand) => {
    if (!config || config.commands.some((item) => item.command === command.command)) return;
    void save({ ...config, commands: [...config.commands, { ...command, id: crypto.randomUUID() }] });
  };
  const analyze = async () => {
    if (typeof Git.analyzeProject !== 'function' || analyzing) return;
    setAnalyzing(true);
    setError('');
    try {
      setAnalysis(await Git.analyzeProject(root, providers.find((provider) => provider.enabled)?.id || ''));
    } catch (e) {
      setError(String(e));
    } finally {
      setAnalyzing(false);
    }
  };
  return (
    <div className="developer-panel">
      <h2 id="modal-title">开发配置</h2>
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
              仓库命令 <small>{config.commands.length} / 30</small>
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
          {profile && (
            <section className="project-detection" aria-label="项目识别">
              <div className="project-detection-heading">
                <span><Sparkles size={14} /> {profile.label}</span>
                <code>{profile.packageManager || '本地检测'}</code>
              </div>
              {profile.commands.length > 0 && (
                <div className="detected-command-list">
                  {profile.commands.map((command) => (
                    <div className="detected-command" key={command.command}>
                      <code>{command.command}</code>
                      <button className="icon-button" title="添加到仓库命令" aria-label={`添加 ${command.command}`} onClick={() => addDetected(command)}>
                        <Plus size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="project-ai-actions">
                <button className="button compact" onClick={() => void analyze()} disabled={analyzing}>
                  {analyzing ? <RefreshCw size={13} className="spin" /> : <Bot size={13} />}
                  {analyzing ? '分析中' : 'AI 分析'}
                </button>
                <button className="button compact" onClick={() => setAiEditing(providers[0] || { id: crypto.randomUUID(), name: '', baseUrl: '', model: '', apiKey: '', enabled: false })}>
                  <Settings2 size={13} />
                  AI 设置
                </button>
              </div>
              {analysis?.summary && <p className="project-ai-result" role="status">{analysis.summary}</p>}
            </section>
          )}
          {aiEditing && (
            <form className="developer-form ai-provider-form" onSubmit={async (event) => {
              event.preventDefault();
              if (typeof Git.saveAIProvider !== 'function') return;
              setWorking(true);
              try {
                await Git.saveAIProvider(aiEditing);
                setProviders(await Git.aiProviders());
                setAiEditing(null);
                setStatus('AI 供应商已保存');
              } catch (e) { setError(String(e)); } finally { setWorking(false); }
            }}>
              <label>名称<input required value={aiEditing.name} onChange={(event) => setAiEditing({ ...aiEditing, name: event.target.value })} placeholder="例如 OpenAI" /></label>
              <label>兼容接口地址<input required value={aiEditing.baseUrl} onChange={(event) => setAiEditing({ ...aiEditing, baseUrl: event.target.value })} placeholder="https://api.example.com/v1" /></label>
              <label>模型<input required value={aiEditing.model} onChange={(event) => setAiEditing({ ...aiEditing, model: event.target.value })} placeholder="例如 gpt-4o-mini" /></label>
              <label>API Key<input type="password" value={aiEditing.apiKey} onChange={(event) => setAiEditing({ ...aiEditing, apiKey: event.target.value })} placeholder="本地 Ollama 可留空" /></label>
              <label className="checkbox-row"><input type="checkbox" checked={aiEditing.enabled} onChange={(event) => setAiEditing({ ...aiEditing, enabled: event.target.checked })} />启用供应商</label>
              <div className="modal-actions"><button type="button" className="button" onClick={() => setAiEditing(null)}>取消</button><button className="button primary" disabled={working}><Check size={13} />保存供应商</button></div>
            </form>
          )}
          {!config.commands.length && !editing && (
            <div className="developer-presets">
              <p>从模板创建命令</p>
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
                  onClick={() => void launch(command)}
                >
                  <Play size={13} />
                  运行
                </button>
                <button
                  className="button compact"
                  disabled={working}
                  onClick={() => {
                    setEditing({ ...command });
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
                仅添加可信命令，将以当前用户权限运行。Windows 使用 PowerShell。
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
        </>
      )}
      {tab === 'environment' && (
        <>
          <div className="developer-heading">
            <strong>工具链检测</strong>
            <button
              className="button compact"
              disabled={detecting || working}
              title="重新读取登录 Shell 或系统环境；登录 Shell 会执行其启动配置"
              onClick={() => void refresh(true)}
            >
              <RefreshCw size={13} className={detecting ? 'spin' : ''} />
              {detecting ? '正在检测…' : '重新读取环境'}
            </button>
          </div>

          {environment?.warning && <p className="developer-warning">{environment.warning}</p>}
          {environment && (
            <>
              <p className="developer-source">
                <span>{environment.source}</span>
                <code>{environment.shell}</code>
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
                每行 KEY=value，不展开变量。PATH 需填写完整路径列表；对新会话生效。
              </p>
              <p className="developer-warning">配置以明文保存在本机，请勿填写密码或 Token。</p>
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
