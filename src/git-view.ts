import type { Commit, File } from './mygo';

export type DiffLine = {
  text: string;
  kind: 'add' | 'remove' | 'hunk' | 'meta' | 'context';
  old?: number;
  next?: number;
};

export type SplitRow =
  | { kind: 'hunk'; line: DiffLine; index: number }
  | { kind: 'meta'; line: DiffLine; index: number }
  | { kind: 'code'; left?: DiffLine; right?: DiffLine; index: number };

// Pair adjacent deletion/addition runs, never across hunks or file boundaries.
export function splitDiff(lines: DiffLine[]): SplitRow[] {
  const rows: SplitRow[] = [];
  for (let i = 0; i < lines.length;) {
    const line = lines[i];
    if (line.kind === 'hunk' || line.kind === 'meta') {
      rows.push({ kind: line.kind, line, index: i++ });
    } else if (line.kind === 'context') {
      rows.push({ kind: 'code', left: line, right: line, index: i++ });
    } else {
      const start = i;
      const left: DiffLine[] = [];
      const right: DiffLine[] = [];
      while (i < lines.length && (lines[i].kind === 'add' || lines[i].kind === 'remove')) {
        const changed = lines[i++];
        (changed.kind === 'remove' ? left : right).push(changed);
      }
      for (let n = 0; n < Math.max(left.length, right.length); n++) {
        rows.push({ kind: 'code', left: left[n], right: right[n], index: start + n });
      }
    }
  }
  return rows;
}

export function parseDiff(text: string, limit?: number): DiffLine[] {
  let old = 0;
  let next = 0;
  let inHunk = false;
  return text
    .replace(/\n$/, '')
    .split('\n', limit)
    .map((text) => {
      const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(text);
      if (match) {
        old = Number(match[1]);
        next = Number(match[2]);
        inHunk = true;
        return { text, kind: 'hunk' };
      }
      if (text.startsWith('diff --git ')) {
        inHunk = false;
        return { text, kind: 'meta' };
      }
      if (!inHunk || text.startsWith('\\')) return { text, kind: 'meta' };
      if (text.startsWith('+')) return { text, kind: 'add', next: next++ };
      if (text.startsWith('-')) return { text, kind: 'remove', old: old++ };
      return { text, kind: 'context', old: old++, next: next++ };
    });
}

export const graphColors = ['var(--green)', '#bf9465', '#7b90b5', '#b17e8b', '#759287'];
export type GraphRow = {
  lane: number;
  color: string;
  paths: { d: string; color: string }[];
};

// Follow parent hashes through topological order; every edge represents Git ancestry.
export function buildGraph(commits: Commit[]): GraphRow[] {
  let lanes: string[] = [];
  const colors = new Map<string, string>();
  let nextColor = 0;
  const colorFor = (hash: string) => {
    if (!colors.has(hash)) colors.set(hash, graphColors[nextColor++ % graphColors.length]);
    return colors.get(hash)!;
  };
  const x = (lane: number) => 20 + lane * 18;
  return commits.map((commit) => {
    const incoming = lanes.includes(commit.hash);
    if (!incoming) lanes.push(commit.hash);
    const before = [...lanes];
    const lane = lanes.indexOf(commit.hash);
    const color = colorFor(commit.hash);
    lanes.splice(lane, 1);
    for (const [i, parent] of commit.parents.entries()) {
      if (!lanes.includes(parent)) {
        lanes.splice(Math.min(lane + i, lanes.length), 0, parent);
        if (i === 0 && !colors.has(parent)) colors.set(parent, color);
        else colorFor(parent);
      }
    }
    const paths: GraphRow['paths'] = [];
    if (incoming) paths.push({ d: `M${x(lane)} 0 V33`, color });
    before.forEach((hash, i) => {
      if (hash === commit.hash) return;
      const j = lanes.indexOf(hash);
      if (j >= 0)
        paths.push({
          d: `M${x(i)} 0 C${x(i)} 32 ${x(j)} 34 ${x(j)} 66`,
          color: colorFor(hash),
        });
    });
    commit.parents.forEach((parent) => {
      const target = lanes.indexOf(parent);
      paths.push({
        d: `M${x(lane)} 33 C${x(lane)} 50 ${x(target)} 49 ${x(target)} 66`,
        color: colorFor(parent),
      });
    });
    return { lane, color, paths };
  });
}

export const isStaged = (file: File) => file.index !== '.' && !file.untracked && !file.conflicted;
export const isUnstaged = (file: File) =>
  file.worktree !== '.' || file.untracked || file.conflicted;
export function fileStatus(file: File, staged: boolean) {
  if (file.conflicted) return { code: '!', label: '冲突', className: 'conflict' };
  const code = file.untracked ? 'A' : staged ? file.index : file.worktree;
  return {
    code,
    label:
      (
        {
          M: '已修改',
          A: '新文件',
          D: '已删除',
          R: '已重命名',
          T: '类型变更',
        } as Record<string, string>
      )[code] ?? '已变更',
    className: code === 'D' ? 'deleted' : code === 'A' ? 'added' : 'modified',
  };
}
