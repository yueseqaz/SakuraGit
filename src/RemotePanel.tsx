import { useEffect, useState } from 'react';
import { isMyGo } from 'mygo-runtime';
import { CheckCircle2, Globe2, KeyRound, Plus, RefreshCw, Trash2, UserRound } from 'lucide-react';
import { Git, type Diagnostics, type RemoteInfo } from './mygo';
import { Dialog } from './Dialog';
import type { Mutate } from './panel-types';
import { ErrorDetails } from './ErrorDetails';

type Edit = { action: 'add' | 'fetch-url' | 'push-url' | 'remove'; item?: RemoteInfo };
export function RemotePanel({
  root,
  version,
  busy,
  run,
}: {
  root: string;
  version: number;
  busy: boolean;
  run: Mutate;
}) {
  const [data, setData] = useState<{
    key: string;
    remotes: RemoteInfo[];
    diagnostics: Diagnostics;
  } | null>(null);
  const [error, setError] = useState('');
  const [edit, setEdit] = useState<Edit | null>(null);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [identity, setIdentity] = useState<{ name: string; email: string } | null>(null);
  const [reload, setReload] = useState(0);
  const key = `${root}:${version}:${reload}`;
  useEffect(() => {
    let active = true;
    setError('');
    (isMyGo()
      ? Promise.all([Git.remotes(root), Git.diagnostics(root)])
      : Promise.resolve<[RemoteInfo[], Diagnostics]>([
          [
            {
              name: 'origin',
              fetchURLs: ['git@example.com:team/atlas.git'],
              pushURLs: ['git@example.com:team/atlas.git'],
              revision: 'demo',
            },
          ],
          {
            version: 'git version 2.x / 示例',
            name: 'Sakura',
            email: 'sakura@example.com',
            credentialHelper: true,
            customSSH: false,
          },
        ])
    )
      .then(([remotes, diagnostics]) => {
        if (active) setData({ key, remotes, diagnostics });
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, [key]);
  const begin = (next: Edit) => {
    setName(next.item?.name || 'origin');
    setAddress(
      next.action === 'push-url' ? next.item?.pushURLs[0] || '' : next.item?.fetchURLs[0] || '',
    );
    setEdit(next);
  };
  const loaded = data?.key === key;
  const submit = async () => {
    if (!edit || busy) return;
    const action = edit;
    setEdit(null);
    const ok = await run(
      '修改远程配置',
      (currentRoot) =>
        Git.manageRemote(
          currentRoot,
          action.action,
          name.trim(),
          address.trim(),
          action.item?.revision || '',
        ),
      '远程配置已更新。没有执行网络同步。',
    );
    if (ok) setReload((n) => n + 1);
  };
  const saveIdentity = async () => {
    if (!identity || busy) return;
    const value = identity;
    setIdentity(null);
    const ok = await run(
      '设置本仓库提交身份',
      (r) => Git.setIdentity(r, value.name.trim(), value.email.trim()),
      '已保存到本仓库配置，不影响其他项目。',
    );
    if (ok) setReload((n) => n + 1);
  };
  return (
    <section className="collection-panel remote-settings-panel">
      <div className="collection-header">
        <span>
          <Globe2 size={18} />
          远程仓库与开发环境
        </span>
        <button className="button compact" disabled={busy} onClick={() => begin({ action: 'add' })}>
          <Plus size={14} />
          添加远程
        </button>
      </div>
      {error ? (
        <div className="panel-error">
          <ErrorDetails message={error} />
          <button className="button compact" onClick={() => setReload((n) => n + 1)}>
            重新读取
          </button>
        </div>
      ) : !data ? (
        <div className="empty-state">正在读取配置…</div>
      ) : (
        <>
          <div className="remote-cards">
            {data.remotes.map((remote) => (
              <article className="remote-card" key={remote.name}>
                <div className="remote-card-title">
                  <span>
                    <Globe2 size={18} />
                    <strong>{remote.name}</strong>
                  </span>
                  <button
                    className="icon-button"
                    disabled={busy || !loaded}
                    aria-label={`删除远程 ${remote.name}`}
                    onClick={() => begin({ action: 'remove', item: remote })}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                <label>FETCH</label>
                {remote.fetchURLs.map((url, i) => (
                  <code className="remote-url" key={i}>
                    {url}
                  </code>
                ))}
                <label>PUSH</label>
                {remote.pushURLs.map((url, i) => (
                  <code className="remote-url" key={i}>
                    {url}
                  </code>
                ))}
                <div className="remote-card-actions">
                  <button
                    className="button compact"
                    disabled={busy || !loaded}
                    onClick={() => begin({ action: 'fetch-url', item: remote })}
                  >
                    修改 Fetch 地址
                  </button>
                  <button
                    className="button compact"
                    disabled={busy || !loaded}
                    onClick={() => begin({ action: 'push-url', item: remote })}
                  >
                    修改 Push 地址
                  </button>
                </div>
              </article>
            ))}
            {!data.remotes.length && (
              <div className="remote-card">
                <h3>尚无远程仓库</h3>
                <p>添加 origin 后，就可以 Fetch 或首次推送本地分支。</p>
              </div>
            )}
          </div>
          <div className="environment-heading">
            <h3>
              开发环境 <span>LOCAL CONFIGURATION</span>
            </h3>
            <button
              className="icon-button"
              aria-label="重新检查开发环境"
              disabled={busy}
              onClick={() => setReload((n) => n + 1)}
            >
              <RefreshCw size={15} />
            </button>
          </div>
          <div className="environment-grid">
            <article>
              <CheckCircle2 size={19} />
              <div>
                <strong>系统 Git</strong>
                <p>{data.diagnostics.version}</p>
              </div>
            </article>
            <article>
              <UserRound size={19} />
              <div>
                <strong>提交身份</strong>
                <p>
                  {data.diagnostics.name || '尚未设置姓名'}
                  <br />
                  {data.diagnostics.email || '尚未设置邮箱'}
                </p>
                <button
                  className="text-button"
                  disabled={busy || !loaded}
                  onClick={() =>
                    setIdentity({ name: data.diagnostics.name, email: data.diagnostics.email })
                  }
                >
                  修改本仓库身份
                </button>
              </div>
            </article>
            <article>
              <KeyRound size={19} />
              <div>
                <strong>认证准备情况</strong>
                <p>
                  {data.diagnostics.credentialHelper
                    ? '检测到凭据助手配置'
                    : '未检测到凭据助手配置'}
                  <br />
                  {data.diagnostics.customSSH ? '使用自定义 SSH 命令' : 'SSH 使用系统默认配置'}
                </p>
                <small>配置存在不代表认证成功；软件不读取私钥，也不保存账号密码。</small>
              </div>
            </article>
          </div>
          <details className="connection-guide">
            <summary>连接故障排查</summary>
            <p>
              HTTPS：检查系统凭据助手和 Token
              权限。SSH：检查密钥、ssh-agent、主机指纹及仓库访问权限。需要交互确认时，请先在终端完成；错误详情会直接显示在当前操作界面。
            </p>
          </details>
        </>
      )}
      {edit && (
        <Dialog onClose={() => !busy && setEdit(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <div className="modal-kicker">SAKURAGIT / REMOTES</div>
            <h2 id="modal-title">
              {edit.action === 'add'
                ? '添加远程仓库'
                : edit.action === 'remove'
                  ? '移除远程仓库？'
                  : '编辑远程地址'}
            </h2>
            <label className="publish-label" htmlFor="remote-name">
              远程名称
            </label>
            <input
              className="modal-input"
              id="remote-name"
              value={name}
              required
              disabled={edit.action !== 'add'}
              onChange={(e) => setName(e.target.value)}
            />
            {edit.action !== 'remove' && (
              <>
                <label className="publish-label" htmlFor="remote-url">
                  {edit.action === 'push-url' ? 'Push 地址' : 'Fetch 地址'}
                </label>
                <input
                  className="modal-input"
                  id="remote-url"
                  autoComplete="off"
                  value={address}
                  required
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="git@example.com:team/project.git"
                />
              </>
            )}
            <p className="modal-description">
              {edit.action === 'remove'
                ? '删除本地远程配置、相关跟踪引用及上游配置。不删除服务器仓库或本地分支，也不会清理你的文件。'
                : edit.action === 'fetch-url'
                  ? '只修改 Fetch 地址。若配置了独立的 Push 地址，Push 地址保持不变。'
                  : edit.action === 'push-url'
                    ? '显式设置此远程的 Push 地址，Fetch 地址保持不变。'
                    : '支持 HTTPS、SSH 或本机绝对路径。不允许在 URL 中放入密码。'}
            </p>
            <div className="modal-buttons">
              <button type="button" className="button" onClick={() => setEdit(null)}>
                取消
              </button>
              <button
                className={`button ${edit.action === 'remove' ? 'danger-outline' : 'primary'}`}
                disabled={busy || !name.trim() || (edit.action !== 'remove' && !address.trim())}
              >
                {edit.action === 'remove' ? '确认移除远程' : '保存远程配置'}
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {identity && (
        <Dialog onClose={() => !busy && setIdentity(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void saveIdentity();
            }}
          >
            <div className="modal-kicker">SAKURAGIT / IDENTITY</div>
            <h2 id="modal-title">提交身份</h2>
            <p className="modal-description">
              仅写入本仓库的 user.name 和
              user.email；不修改历史提交，不改动全局设置。提交签名沿用现有 Git 配置。
            </p>
            <label className="publish-label" htmlFor="identity-name">
              姓名
            </label>
            <input
              id="identity-name"
              className="modal-input"
              required
              value={identity.name}
              onChange={(e) => setIdentity({ ...identity, name: e.target.value })}
            />
            <label className="publish-label" htmlFor="identity-email">
              邮箱
            </label>
            <input
              id="identity-email"
              className="modal-input"
              type="email"
              required
              value={identity.email}
              onChange={(e) => setIdentity({ ...identity, email: e.target.value })}
            />
            <div className="modal-buttons">
              <button type="button" className="button" onClick={() => setIdentity(null)}>
                取消
              </button>
              <button className="button primary" disabled={busy}>
                保存本仓库身份
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </section>
  );
}
