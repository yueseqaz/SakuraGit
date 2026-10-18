import type { Startup, WorkspaceSession } from './mygo';
const storageName = ['gitlane', 'workspace', 'v1'].join('.');
const absolute = (v: string) =>
  (v.startsWith('/') || /^[A-Za-z]:[\\/]/.test(v)) && v.length <= 4096 && !v.includes('\0');
export const emptySession = (): WorkspaceSession => ({
  root: '',
  view: 'changes',
  kind: '',
  path: '',
  hash: '',
  staged: false,
  search: '',
  drafts: {},
  updatedAt: 0,
});
export function readSessionCache(): WorkspaceSession {
  try {
    const v = JSON.parse(localStorage.getItem(storageName) || 'null');
    if (
      !v ||
      typeof v.root !== 'string' ||
      typeof v.updatedAt !== 'number' ||
      !Number.isSafeInteger(v.updatedAt) ||
      v.updatedAt < 0 ||
      (v.root !== '' && !absolute(v.root)) ||
      !['changes', 'history', 'worktrees', 'stashes', 'remotes', 'workflow'].includes(v.view) ||
      !v.drafts ||
      typeof v.drafts !== 'object' ||
      Array.isArray(v.drafts) ||
      Object.keys(v.drafts).length > 64
    )
      return emptySession();
    const drafts: WorkspaceSession['drafts'] = {};
    for (const [root, d] of Object.entries(v.drafts) as [
      string,
      { title?: unknown; body?: unknown },
    ][]) {
      if (
        absolute(root) &&
        typeof d?.title === 'string' &&
        typeof d.body === 'string' &&
        d.title.length <= 250 &&
        d.body.length <= 18000
      )
        drafts[root] = { title: d.title, body: d.body };
    }
    return {
      ...emptySession(),
      ...v,
      drafts,
      kind: ['file', 'commit', 'stash'].includes(v.kind) ? v.kind : '',
      path:
        typeof v.path === 'string' && v.path.length <= 4096 && !v.path.includes('\0') ? v.path : '',
      hash: typeof v.hash === 'string' && /^[a-f0-9]{0,64}$/.test(v.hash) ? v.hash : '',
      search: typeof v.search === 'string' ? v.search.slice(0, 512) : '',
      staged: v.staged === true,
    };
  } catch {
    return emptySession();
  }
}
export function cacheSession(session: WorkspaceSession): boolean {
  try {
    localStorage.setItem(storageName, JSON.stringify(session));
    return true;
  } catch {
    return false;
  }
}
export function newerSession(native: WorkspaceSession, cached: WorkspaceSession) {
  return cached.updatedAt > native.updatedAt ? cached : native;
}
export function restoreStartup(startup: Startup, cached: WorkspaceSession) {
  const saved = startup.ephemeral ? emptySession() : newerSession(startup.session, cached);
  const path =
    startup.ephemeral || startup.explicitPath ? startup.path : saved.root || startup.path;
  return { saved, path };
}
