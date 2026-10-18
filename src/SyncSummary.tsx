import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  GitBranch,
  Globe2,
  ShieldCheck,
  Terminal,
} from 'lucide-react';
import type { Snapshot } from './mygo';
export { syncCommand } from './sync-plan';

export function SyncSummary({
  action,
  plan,
  publish,
}: {
  action: 'fetch' | 'pull' | 'push';
  plan?: Snapshot;
  publish?: { remote: string; branch: string };
}) {
  if (!plan) return <p className="form-error">仓库状态不可用，请关闭后刷新。</p>;
  const pushing = action === 'push';
  const remote = publish?.remote ?? plan.upstreamRemote;
  const target = publish?.branch ?? plan.upstreamBranch;
  return (
    <div className="sync-summary">
      <div className="sync-plan-heading">
        {pushing ? <ArrowUp size={18} /> : <ArrowDown size={18} />}
        <div>
          <strong>
            {publish
              ? '发布当前分支'
              : pushing
                ? plan.ahead > 0
                  ? `推送 ${plan.ahead} 个本地提交`
                  : '同步当前分支'
                : action === 'pull'
                  ? `拉取 ${plan.behind} 个已知远程提交`
                  : '获取远程更新'}
          </strong>
          <span>
            {action === 'fetch'
              ? '只更新本地的远程引用，不合并代码'
              : publish
                ? '成功后建立上游跟踪关系'
                : '数量基于最近一次获取的远程状态'}
          </span>
        </div>
      </div>
      {action === 'fetch' ? (
        <div className="fetch-targets">
          <span>将检查以下远程</span>
          {plan.remotes.map((r) => (
            <code key={r}>
              <Globe2 size={13} />
              {r}
            </code>
          ))}
        </div>
      ) : (
        <div className="sync-route">
          <div className="sync-endpoint">
            <span>
              <GitBranch size={13} />
              {pushing ? '从本地分支' : '更新本地分支'}
            </span>
            <strong>{plan.branch}</strong>
            <small>{plan.name} · 本地</small>
          </div>
          <ArrowRight size={20} className={pushing ? 'route-arrow' : 'route-arrow pull-arrow'} />
          <div className="sync-endpoint destination">
            <span>
              <Globe2 size={13} />
              {remote === '.' ? '本仓库目标' : '远程目标'}
            </span>
            <strong>{target || '请填写分支名'}</strong>
            <small>{remote || '请选择远程'}</small>
          </div>
        </div>
      )}
      <div className="sync-safety">
        <ShieldCheck size={15} />
        <span>
          {pushing
            ? '普通推送，不强制覆盖，不推送其他分支或标签'
            : action === 'pull'
              ? '只允许快进，不自动合并、不改写历史'
              : '不改变工作区文件和当前分支'}
        </span>
      </div>
      {pushing && !publish && plan.behind > 0 && (
        <p className="sync-warning">远程还有 {plan.behind} 个提交未整合，请先拉取，再推送。</p>
      )}
      {pushing && !publish && plan.ahead === 0 && (
        <p className="sync-note">当前没有已知的待推送提交。可以先获取远程更新，再检查同步状态。</p>
      )}
    </div>
  );
}

export function CommandDetails({ command }: { command: string }) {
  if (!command) return null;
  return (
    <details className="command-details">
      <summary>
        <Terminal size={14} />
        查看实际 Git 命令
      </summary>
      <code>{command}</code>
      <p>仅供核对；应用直接调用 Git，不通过 Shell 执行这段文本。</p>
    </details>
  );
}
