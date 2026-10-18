import Prism from 'prismjs';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-csharp';
import 'prismjs/components/prism-toml';
import 'prismjs/components/prism-docker';
import { diffWordsWithSpace } from 'diff';
import { splitDiff, type DiffLine } from './git-view';

type Range = { start: number; end: number };
type Syntax = Range & { type: string };
export type CodeSpan = { text: string; type: string; changed: boolean };

export function languageFor(path: string): string {
  const filename = path.split('/').at(-1)?.toLowerCase() || '';
  if (filename === 'dockerfile' || filename.startsWith('dockerfile.')) return 'docker';
  const extension = filename.split('.').at(-1) || '';
  return (
    (
      {
        js: 'javascript',
        mjs: 'javascript',
        cjs: 'javascript',
        jsx: 'jsx',
        ts: 'typescript',
        tsx: 'tsx',
        go: 'go',
        py: 'python',
        sh: 'bash',
        bash: 'bash',
        zsh: 'bash',
        json: 'json',
        css: 'css',
        html: 'markup',
        htm: 'markup',
        vue: 'markup',
        svg: 'markup',
        xml: 'markup',
        md: 'markdown',
        yml: 'yaml',
        yaml: 'yaml',
        sql: 'sql',
        rs: 'rust',
        c: 'c',
        h: 'c',
        cpp: 'cpp',
        cc: 'cpp',
        cxx: 'cpp',
        hpp: 'cpp',
        java: 'java',
        cs: 'csharp',
        toml: 'toml',
      } as Record<string, string>
    )[extension] || ''
  );
}

function flatten(tokens: (string | Prism.Token)[], start = 0, inherited = ''): Syntax[] {
  const ranges: Syntax[] = [];
  let offset = start;
  for (const token of tokens) {
    if (typeof token === 'string') {
      if (token.length) ranges.push({ start: offset, end: offset + token.length, type: inherited });
      offset += token.length;
    } else {
      const content =
        typeof token.content === 'string'
          ? [token.content]
          : Array.isArray(token.content)
            ? token.content
            : [token.content];
      const nested = flatten(content, offset, token.type);
      ranges.push(...nested);
      offset = nested.at(-1)?.end ?? offset;
    }
  }
  return ranges;
}

export function changedRanges(before: string, after: string): [Range[], Range[]] {
  if (before.length > 2000 || after.length > 2000) return [[], []];
  const changes = diffWordsWithSpace(before, after, { timeout: 2, maxEditLength: 256 });
  const left: Range[] = [],
    right: Range[] = [];
  let old = 0,
    next = 0;
  for (const part of changes || []) {
    if (part.removed) {
      left.push({ start: old, end: old + part.value.length });
      old += part.value.length;
    } else if (part.added) {
      right.push({ start: next, end: next + part.value.length });
      next += part.value.length;
    } else {
      old += part.value.length;
      next += part.value.length;
    }
  }
  return [left, right];
}

function decorate(text: string, syntax: Syntax[], changes: Range[]): CodeSpan[] {
  const points = [
    ...new Set([
      0,
      text.length,
      ...syntax.flatMap((r) => [r.start, r.end]),
      ...changes.flatMap((r) => [r.start, r.end]),
    ]),
  ].sort((a, b) => a - b);
  let token = 0,
    change = 0;
  return points.slice(0, -1).map((start, i) => {
    const end = points[i + 1];
    while (token < syntax.length && syntax[token].end <= start) token++;
    while (change < changes.length && changes[change].end <= start) change++;
    return {
      text: text.slice(start, end),
      type: syntax[token]?.start <= start ? syntax[token].type : '',
      changed: changes[change]?.start <= start && changes[change]?.end >= end,
    };
  });
}

// Before/after sources are tokenized separately and reset at each hunk/file boundary.
// Diff decorations never mutate patch text or its original hunk indices.
export function highlightDiff(lines: DiffLine[], path: string): Map<DiffLine, CodeSpan[]> {
  const syntax = new Map<DiffLine, Syntax[]>();
  const changes = new Map<DiffLine, Range[]>();
  let budget = 200000;
  let oldPath = path,
    newPath = path;
  const tokenize = (group: DiffLine[], file: string) => {
    const grammar = Prism.languages[languageFor(file)];
    const source = group.map((line) => line.text.slice(1)).join('\n');
    if (
      !grammar ||
      source.length > 60000 ||
      source.length > budget ||
      group.some((line) => line.text.length > 4000)
    )
      return;
    budget -= source.length;
    let tokens: Syntax[];
    try {
      tokens = flatten(Prism.tokenize(source, grammar));
    } catch {
      return;
    }
    let start = 0,
      index = 0;
    for (const line of group) {
      const end = start + line.text.length - 1;
      while (index < tokens.length && tokens[index].end <= start) index++;
      const ranges: Syntax[] = [];
      for (let n = index; n < tokens.length && tokens[n].start < end; n++) {
        ranges.push({
          start: Math.max(start, tokens[n].start) - start,
          end: Math.min(end, tokens[n].end) - start,
          type: tokens[n].type,
        });
      }
      // Context has the same text on both sides; prefer after-side lexical context.
      syntax.set(line, ranges);
      start = end + 1;
    }
  };
  let group: DiffLine[] = [];
  const flush = () => {
    tokenize(
      group.filter((l) => l.kind !== 'add'),
      oldPath,
    );
    tokenize(
      group.filter((l) => l.kind !== 'remove'),
      newPath,
    );
    group = [];
  };
  for (const line of lines) {
    if (line.kind === 'hunk' || line.kind === 'meta') {
      // A missing-final-newline marker is metadata, not a new source boundary.
      if (!line.text.startsWith('\\')) flush();
      if (line.text.startsWith('--- a/')) oldPath = line.text.slice(6).split('\t')[0];
      if (line.text.startsWith('+++ b/')) newPath = line.text.slice(6).split('\t')[0];
    } else group.push(line);
  }
  flush();
  let wordBudget = 60000;
  for (const row of splitDiff(lines)) {
    if (row.kind === 'code' && row.left?.kind === 'remove' && row.right?.kind === 'add') {
      wordBudget -= row.left.text.length + row.right.text.length;
      if (wordBudget < 0) break;
      const [left, right] = changedRanges(row.left.text.slice(1), row.right.text.slice(1));
      changes.set(row.left, left);
      changes.set(row.right, right);
    }
  }
  return new Map(
    lines
      .filter((l) => l.kind !== 'meta' && l.kind !== 'hunk')
      .map((line) => [
        line,
        decorate(line.text.slice(1), syntax.get(line) || [], changes.get(line) || []),
      ]),
  );
}
