import type { Diff, Snapshot } from './mygo';

const h = (n: number) => n.toString(16).padStart(40, '0');
const commit = (n: number, parents: number[], subject: string, author: string, refs = '') => ({
  hash: h(n),
  short: h(n).slice(-7),
  parents: parents.map(h),
  subject,
  author,
  authorEmail: `${author.toLowerCase().replaceAll(' ', '.')}@example.com`,
  date: `2026-10-18T${String(16 - n).padStart(2, '0')}:24:00+08:00`,
  refs,
});
export const demoSnapshot: Snapshot = {
  root: '/preview/atlas',
  name: 'atlas',
  branch: 'feature/command-menu',
  upstream: 'origin/feature/command-menu',
  upstreamRemote: 'origin',
  upstreamBranch: 'feature/command-menu',
  ahead: 2,
  behind: 0,
  unborn: false,
  detached: false,
  state: '',
  historyHasMore: false,
  historyRevision: 'preview',
  files: [
    {
      path: 'src/components/CommandMenu.tsx',
      index: '.',
      worktree: 'M',
      oldPath: '',
      untracked: false,
      conflicted: false,
    },
    {
      path: 'src/styles/command-menu.css',
      index: '.',
      worktree: 'M',
      oldPath: '',
      untracked: false,
      conflicted: false,
    },
    {
      path: 'src/hooks/useKeyboard.ts',
      index: '.',
      worktree: '?',
      oldPath: '',
      untracked: true,
      conflicted: false,
    },
    {
      path: 'src/components/SearchInput.tsx',
      index: 'M',
      worktree: '.',
      oldPath: '',
      untracked: false,
      conflicted: false,
    },
    {
      path: 'README.md',
      index: 'M',
      worktree: '.',
      oldPath: '',
      untracked: false,
      conflicted: false,
    },
  ],
  branches: [
    {
      name: 'feature/command-menu',
      current: true,
      remote: false,
      upstream: 'origin/feature/command-menu',
      subject: 'feat: add command menu foundation',
    },
    {
      name: 'main',
      current: false,
      remote: false,
      upstream: 'origin/main',
      subject: 'Merge navigation improvements',
    },
    {
      name: 'fix/sidebar-layout',
      current: false,
      remote: false,
      upstream: '',
      subject: 'fix: sidebar layout',
    },
    {
      name: 'origin/main',
      current: false,
      remote: true,
      upstream: '',
      subject: 'Merge navigation improvements',
    },
    {
      name: 'origin/feature/command-menu',
      current: false,
      remote: true,
      upstream: '',
      subject: 'feat: add search input',
    },
  ],
  commits: [
    commit(1, [2], 'feat: add command menu foundation', 'Sakura', 'HEAD -> feature/command-menu'),
    commit(2, [3], 'feat: introduce keyboard navigation', 'Sakura'),
    commit(3, [4], 'feat: add search input', 'Sakura', 'origin/feature/command-menu'),
    commit(4, [5, 6], 'Merge navigation improvements', 'Alex Chen', 'main, origin/main'),
    commit(5, [7], 'refactor: simplify workspace navigation', 'Alex Chen'),
    commit(6, [7], 'fix: keep sidebar width consistent', 'Mika', 'fix/sidebar-layout'),
    commit(7, [8], 'style: refine the workspace palette', 'Sakura'),
    commit(8, [], 'chore: a fresh start', 'Sakura'),
  ],
  worktrees: [
    { path: '/preview/atlas', branch: 'feature/command-menu', detached: false },
    {
      path: '/preview/atlas-sidebar',
      branch: 'fix/sidebar-layout',
      detached: false,
    },
  ],
  remotes: ['origin'],
  stashes: [
    {
      ref: 'stash@{0}',
      hash: h(21),
      subject: 'On feature/command-menu: 登录页做到一半，先处理修复',
      date: '2026-10-18T10:30:00+08:00',
    },
    {
      ref: 'stash@{1}',
      hash: h(22),
      subject: 'On main: 临时保存导航调整',
      date: '2026-10-17T18:20:00+08:00',
    },
  ],
};

const commandDiff = `diff --git a/src/components/CommandMenu.tsx b/src/components/CommandMenu.tsx
index 2d31bf0..8f09a12 100644
--- a/src/components/CommandMenu.tsx
+++ b/src/components/CommandMenu.tsx
@@ -1,8 +1,11 @@
 import { useState } from 'react';
+import { useKeyboard } from '../hooks/useKeyboard';
 import { SearchInput } from './SearchInput';
 
 export function CommandMenu({ commands }) {
   const [query, setQuery] = useState('');
-  const [selected, setSelected] = useState(null);
+  const [selected, setSelected] = useState(0);
+  const [isOpen, setIsOpen] = useState(false);
 
   const filtered = commands.filter(command =>
@@ -12,12 +15,20 @@ export function CommandMenu({ commands }) {
     command.label.toLowerCase().includes(query.toLowerCase())
   );
 
+  useKeyboard('mod+k', () => {
+    setIsOpen(previous => !previous);
+    setQuery('');
+    setSelected(0);
+  });
+
   return (
-    <div className="command-menu">
+    <div className="command-menu" data-open={isOpen}>
       <SearchInput
         value={query}
         onChange={setQuery}
+        placeholder="Where would you like to go?"
+        autoFocus
       />
       <CommandList items={filtered} selected={selected} />
     </div>
`;

function diffWithHunks(path: string, text: string): Diff {
  return {
    path,
    text,
    binary: false,
    revision: 'demo-read-only',
    hunks: text
      .replace(/\n$/, '')
      .split('\n')
      .flatMap((header, line) => (header.startsWith('@@ ') ? [{ id: 0, line, header }] : []))
      .map((h, i) => ({ ...h, id: i })),
  };
}
export function demoDiff(path: string): Diff {
  if (path.endsWith('CommandMenu.tsx')) return diffWithHunks(path, commandDiff);
  const snippets: Record<string, string> = {
    'src/styles/command-menu.css':
      '@@ -1,3 +1,5 @@\n .command-menu {\n-  border-radius: 8px;\n+  border-radius: 12px;\n+  border: 1px solid var(--border);\n+  box-shadow: 0 16px 48px #142d1714;\n }',
    'src/hooks/useKeyboard.ts':
      '@@ -0,0 +1,5 @@\n+import { useEffect } from "react";\n+\n+export function useKeyboard(shortcut, callback) {\n+  // Register a scoped keyboard shortcut.\n+}',
    'src/components/SearchInput.tsx':
      '@@ -1,3 +1,4 @@\n export function SearchInput(props) {\n-  return <input {...props} />;\n+  return <input type="search"\n+    aria-label="Search commands" {...props} />;\n }',
    'README.md':
      '@@ -1,2 +1,4 @@\n # Atlas\n A little more room for your ideas.\n+\n+Press Cmd+K to find your next destination.',
  };
  return diffWithHunks(
    path,
    `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n${snippets[path] || '@@ -1 +1 @@\n-before\n+after'}\n`,
  );
}
