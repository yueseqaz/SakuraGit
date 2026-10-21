// UI contract/visual checks only. IPC is a fixture; no real Git or shells run.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { demoSnapshot } from '../src/demo.ts';

const output = 'build/workbench-ui';
await mkdir(output, { recursive: true });
const server = spawn(
  process.execPath,
  [
    'node_modules/vite/bin/vite.js',
    'preview',
    '--host',
    '127.0.0.1',
    '--port',
    '5275',
    '--strictPort',
  ],
  { stdio: 'inherit' },
);
let browser;
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch('http://127.0.0.1:5275')).ok) break;
    } catch {}
    if (i === 99) throw new Error('Preview server did not start');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ headless: true });
  const patch = {
    path: 'src/command.ts',
    text: 'diff --git a/src/command.ts b/src/command.ts\n--- a/src/command.ts\n+++ b/src/command.ts\n@@ -1,3 +1,3 @@\n export function label() {\n-  return "before";\n+  return "mist-blue";\n }\n',
    revision: 'fixture-diff',
    binary: false,
    hunks: [{ id: 0, line: 3, header: '@@ -1,3 +1,3 @@' }],
  };
  const conflict = {
    path: patch.path,
    base: 'export const label = "base";\n',
    ours: 'export const label = "ours";\n',
    theirs: 'export const label = "theirs";\n',
    result:
      'export const ready = true;\n<<<<<<< HEAD\nexport const label = "ours";\n=======\nexport const label = "theirs";\n>>>>>>> feature\n',
    revision: 'fixture-conflict',
    state: 'merge',
  };
  async function fixture(
    palette,
    appearance,
    merge = false,
    viewport = { width: 1440, height: 920 },
  ) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    const failures = [];
    page.on('pageerror', (error) => failures.push(error.message));
    const snapshot = {
      ...demoSnapshot,
      state: merge ? 'merge' : '',
      files: [
        {
          path: patch.path,
          oldPath: '',
          index: merge ? 'U' : '.',
          worktree: merge ? 'U' : 'M',
          untracked: false,
          conflicted: merge,
        },
      ],
    };
    await page.addInitScript(
      ({ snapshot, patch, conflict, palette, appearance }) => {
        window.__SAKURAGIT_EMBEDDED__ = true;
        window.__fixtureCalls = [];
        const listeners = {};
        let editorFile = {
          path: patch.path,
          content: 'export const label = "mist-blue";\n',
          revision: 'a'.repeat(64),
        };
        globalThis.mygo = {
          on(name, callback) {
            (listeners[name] ||= []).push(callback);
            return () => {
              listeners[name] = listeners[name].filter((cb) => cb !== callback);
            };
          },
          async call(method, ...args) {
            window.__fixtureCalls.push({ method, args });
            const data = {
              'Git.EditorDirectory': {
                entries: [{ name: 'command.ts', path: patch.path, directory: false }],
                truncated: false,
              },
              'Git.EditorFile': editorFile,
              'Git.Bootstrap': {
                path: snapshot.root,
                recents: [{ name: snapshot.name, path: snapshot.root }],
                ephemeral: true,
                explicitPath: true,
                session: {
                  root: '',
                  view: 'changes',
                  kind: '',
                  path: '',
                  hash: '',
                  search: '',
                  staged: false,
                  drafts: {},
                  updatedAt: 0,
                },
              },
              'Git.Preferences': { palette, appearance, codeSize: 12 },
              'Git.Open': snapshot,
              'Git.Snapshot': snapshot,
              'Git.Diff': patch,
              'Git.Conflict': conflict,
              'Git.OperationStatus': {
                id: '',
                state: 'idle',
                phase: '',
                label: '',
                percent: -1,
                detail: '',
                startedAt: 0,
              },
              'Git.ChangeToken': 'fixture-stable',
              'Git.Workflow': {
                revision: 'fixture-workflow',
                state: snapshot.state,
                head: snapshot.commits[0].hash,
                conflicts: snapshot.files.filter((f) => f.conflicted),
                branches: [],
                submodules: false,
                lfs: false,
              },
              'Git.FileBackups': [],
            };
            if (method === 'Git.SaveConflict' || method === 'Git.StageLines')
              return { output: 'fixture only' };
            if (method === 'Git.SaveEditorFile') {
              editorFile = { path: args[1], content: args[3], revision: 'b'.repeat(64) };
              return editorFile;
            }
            if (
              method === 'Git.EditorDirty' ||
              method === 'Git.WorkbenchModal' ||
              method === 'Git.SavePreferences' ||
              method === 'Git.SaveSession' ||
              method === 'Git.TextContextMenu'
            )
              return;
            if (!(method in data)) throw new Error(`Unmocked fixture IPC: ${method}`);
            return structuredClone(data[method]);
          },
        };
      },
      { snapshot, patch, conflict, palette, appearance },
    );
    await page.goto('http://127.0.0.1:5275');
    await page.getByLabel(merge ? '三方合并编辑器' : '差异详情').waitFor();
    await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
    await page.waitForFunction(
      ({ palette, appearance }) =>
        document.documentElement.dataset.palette === palette &&
        document.documentElement.dataset.theme === appearance,
      { palette, appearance },
    );
    return { page, failures };
  }
  for (const palette of ['mist', 'graphite', 'forest', 'sand'])
    for (const mode of ['light', 'dark']) {
      const { page, failures } = await fixture(palette, mode);
      await page.getByRole('button', { name: '并排', exact: true }).click();
      await page.screenshot({ path: `${output}/${palette}-${mode}-workspace.png` });
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
        false,
        `${palette}/${mode} overflows`,
      );
      await page.getByRole('button', { name: '代码编辑器', exact: true }).click();
      await page.getByRole('button', { name: 'command.ts', exact: true }).click();
      const code = page.getByRole('textbox', { name: `编辑代码 ${patch.path}` });
      await code.waitFor();
      await code.click();
      await page.keyboard.press('ControlOrMeta+End');
      await page.keyboard.insertText('// editor fixture\n');
      await page.screenshot({ path: `${output}/${palette}-${mode}-editor.png` });
      await page.getByRole('button', { name: '保存', exact: true }).click();
      await page.waitForFunction(() =>
        window.__fixtureCalls.some((c) => c.method === 'Git.SaveEditorFile'),
      );
      const saved = await page.evaluate(() =>
        window.__fixtureCalls.find((c) => c.method === 'Git.SaveEditorFile'),
      );
      assert.deepEqual(saved.args, [
        demoSnapshot.root,
        patch.path,
        'a'.repeat(64),
        'export const label = "mist-blue";\n// editor fixture\n',
      ]);
      await page.getByRole('button', { name: '查看 Diff', exact: true }).click();
      if (palette === 'mist' && mode === 'light') {
        await page.getByLabel('选择新第 2 行新增').check();
        await page.getByRole('button', { name: '暂存所选行', exact: true }).click();
        await page.waitForFunction(() =>
          window.__fixtureCalls.some((c) => c.method === 'Git.StageLines'),
        );
        const chosen = await page.evaluate(() =>
          window.__fixtureCalls.find((c) => c.method === 'Git.StageLines'),
        );
        assert.deepEqual(chosen.args, [demoSnapshot.root, patch.path, false, patch.revision, [6]]);
        await page.getByLabel('设置与外观').click();
        await page.getByRole('button', { name: /苔原绿/ }).click();
        await page.waitForFunction(() => document.documentElement.dataset.palette === 'forest');
        await page.screenshot({ path: `${output}/theme-settings.png` });
      }
      assert.deepEqual(failures, []);
      await page.close();
    }
  for (const mode of ['light', 'dark']) {
    const { page, failures } = await fixture('mist', mode, true);
    await page.getByLabel('合并结果代码').waitFor();
    await page.screenshot({ path: `${output}/merge-${mode}.png` });
    await page.getByRole('button', { name: '依次保留双方', exact: true }).click();
    assert.equal(
      await page.getByLabel('合并结果代码').inputValue(),
      'export const ready = true;\n' + conflict.ours + conflict.theirs,
    );
    await page.getByRole('button', { name: '保存并暂存', exact: true }).click();
    await page.getByRole('button', { name: '确认保存并暂存', exact: true }).click();
    await page.waitForFunction(() =>
      window.__fixtureCalls.some((c) => c.method === 'Git.SaveConflict'),
    );
    assert.deepEqual(failures, []);
    await page.close();
  }
  for (const viewport of [
    { width: 1440, height: 420 },
    { width: 900, height: 620 },
    { width: 390, height: 844 },
  ]) {
    const { page, failures } = await fixture('mist', 'light', false, viewport);
    await page.screenshot({ path: `${output}/workspace-${viewport.width}.png`, fullPage: true });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
      false,
      `viewport ${viewport.width} overflows`,
    );
    assert.deepEqual(failures, []);
    if (viewport.height === 420) {
      await page.getByLabel('设置与外观').scrollIntoViewIfNeeded();
      assert.ok(
        await page.evaluate(() => document.querySelector('.sidebar').scrollTop > 0),
        'short docked viewport must keep settings reachable',
      );
    }
    await page.close();
  }
  console.log(
    'Workbench UI fixture contracts and 22 visual snapshots passed. Native PTYs are tested separately.',
  );
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
