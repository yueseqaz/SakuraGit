import type { Snapshot } from './mygo';

export function quoteGitArg(value: string): string {
  return /^[A-Za-z0-9_./:@=-]+$/.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`;
}

// This is a display-only rendering of the backend's argument list, never executed by a shell.
export function syncCommand(action: 'fetch' | 'pull' | 'push', plan?: Snapshot): string {
  if (action === 'fetch') return 'git fetch --all';
  if (!plan?.upstreamRemote || !plan.upstreamBranch) return '';
  if (action === 'pull')
    return `git -c merge.autostash=false pull --ff-only --no-rebase ${quoteGitArg(plan.upstreamRemote)} ${quoteGitArg(`refs/heads/${plan.upstreamBranch}`)}`;
  return `git push --no-force --no-follow-tags --recurse-submodules=no ${quoteGitArg(plan.upstreamRemote)} ${quoteGitArg(`HEAD:refs/heads/${plan.upstreamBranch}`)}`;
}
