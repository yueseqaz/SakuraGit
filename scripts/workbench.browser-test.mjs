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
    historyCount = 0,
    customHistory = null,
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
    const history =
      customHistory ??
      (historyCount
        ? Array.from({ length: historyCount }, (_, index) => ({
            ...snapshot.commits[0],
            hash: (index + 1000).toString(16).padStart(40, '0'),
            short: (index + 1000).toString(16).padStart(7, '0'),
            parents:
              index + 1 < historyCount ? [(index + 1001).toString(16).padStart(40, '0')] : [],
            subject: `Pagination fixture ${index + 1}`,
            refs: '',
          }))
        : snapshot.commits);
    if (historyCount || customHistory) {
      snapshot.commits = history.slice(0, 100);
      snapshot.historyHasMore = history.length > 100;
    }
    await page.addInitScript(
      ({ snapshot, patch, conflict, palette, appearance, history }) => {
        window.__SAKURAGIT_EMBEDDED__ = true;
        window.__fixtureCalls = [];
        const listeners = {};
        let editorFile = {
          path: patch.path,
          content: 'export const label = "mist-blue";' + (appearance === 'dark' ? '\r\n' : '\n'),
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
              'Git.EditorPreview': {
                path: args[1],
                size: 9000,
                offset: args[2],
                data: btoa('\x00\xffABC'),
                mime: '',
                image: false,
                more: true,
              },
              'Git.DeveloperConfig': {
                variables: [],
                commands: [
                  { id: 'dev', name: '启动开发服务', command: 'npm run dev', directory: '' },
                ],
              },
              'Git.DevelopmentEnvironment': {
                shell: '/bin/zsh',
                source: 'UI fixture only',
                warning: '',
                variables: [{ name: 'PATH', value: '/opt/tools/bin:/usr/bin:/bin' }],
                tools: [
                  'java',
                  'javac',
                  'go',
                  'php',
                  'node',
                  'npm',
                  'pnpm',
                  'yarn',
                  'composer',
                ].map((name) => ({
                  name,
                  path: '/opt/tools/bin/' + name,
                  version: 'fixture version',
                })),
              },
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
              'Git.History': {
                commits: history.slice(args[3], args[3] + 100),
                hasMore: args[3] + 100 < history.length,
                nextOffset: Math.min(history.length, args[3] + 100),
                revision: snapshot.historyRevision,
              },
              'Git.StashDiff': patch,
              'Git.CommitFileDiff': patch,
              'Git.CommitDetails': {
                commit: snapshot.commits[0],
                body: 'UI fixture commit',
                committer: snapshot.commits[0].author,
                committerEmail: snapshot.commits[0].authorEmail,
                committedAt: snapshot.commits[0].date,
                files: [
                  {
                    path: patch.path,
                    oldPath: '',
                    status: 'M',
                    additions: 1,
                    deletions: 1,
                    binary: false,
                  },
                ],
              },
              'Git.Remotes': [
                {
                  name: 'origin',
                  fetchURLs: ['https://example.invalid/fixture.git'],
                  pushURLs: ['https://example.invalid/fixture.git'],
                  revision: 'fixture-remote',
                },
              ],
              'Git.Diagnostics': {
                version: 'git version UI fixture',
                name: 'Fixture Author',
                email: 'fixture@example.invalid',
                credentialHelper: true,
                customSSH: false,
              },
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
            if (method === 'Git.EditorFile' && args[1] === 'bytes.bin')
              throw new Error('Binary fixture is not editable text');
            if (method === 'Git.RunDeveloperCommand' || method === 'Git.SaveDeveloperConfig')
              return;
            if (
              method === 'Git.SaveConflict' ||
              method === 'Git.StageLines' ||
              method === 'Git.Sync'
            )
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
      { snapshot, patch, conflict, palette, appearance, history },
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
  async function checkDesign(page) {
    const result = await page.evaluate(() => {
      const invalidText = [...document.querySelectorAll('body *')].flatMap((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const hasText = [...element.childNodes].some(
          (node) => node.nodeType === 3 && node.textContent.trim(),
        );
        if (
          !hasText ||
          !rect.width ||
          !rect.height ||
          style.visibility === 'hidden' ||
          style.fontSize === '0px'
        )
          return [];
        return [12, 14, 18].includes(parseFloat(style.fontSize))
          ? []
          : [`${element.className}: ${style.fontSize}`];
      });
      const sample = document.createElement('button');
      sample.className = 'button primary';
      document.body.append(sample);
      const style = getComputedStyle(sample);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const context = canvas.getContext('2d');
      const luminance = (color) => {
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        const channels = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3).map((value) => {
          const v = value / 255;
          return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        });
        return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
      };
      const values = [luminance(style.color), luminance(style.backgroundColor)].sort(
        (a, b) => a - b,
      );
      sample.remove();
      return { invalidText, contrast: (values[1] + 0.05) / (values[0] + 0.05) };
    });
    assert.deepEqual(result.invalidText, [], 'visible UI uses only the approved text sizes');
    assert.ok(
      result.contrast >= 4.5,
      `primary label contrast ${result.contrast} must meet WCAG AA`,
    );
  }
  for (const palette of ['mist', 'graphite', 'forest', 'sand'])
    for (const mode of ['light', 'dark']) {
      const { page, failures } = await fixture(palette, mode);
      await page.getByRole('button', { name: '并排', exact: true }).click();
      await checkDesign(page);
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
      await page.locator('.cm-content .cm-line span').first().waitFor();
      await checkDesign(page);
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
        ['export const label = "mist-blue";', '// editor fixture', ''].join(
          mode === 'dark' ? '\r\n' : '\n',
        ),
      ]);
      await page.getByRole('button', { name: '查看 Diff', exact: true }).click();
      if (palette === 'mist' && mode === 'light') {
        await page.getByRole('button', { name: 'Fetch', exact: true }).click();
        await page.waitForFunction(() =>
          window.__fixtureCalls.some((c) => c.method === 'Git.Sync'),
        );
        assert.equal(
          await page.getByRole('dialog').count(),
          0,
          'Fetch does not require a redundant confirmation',
        );
        const fetchCall = await page.evaluate(() =>
          window.__fixtureCalls.find((c) => c.method === 'Git.Sync'),
        );
        assert.deepEqual(fetchCall.args, [demoSnapshot.root, 'fetch', '', '', '']);
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
        await checkDesign(page);
        await page.screenshot({ path: `${output}/theme-settings.png` });
      }
      assert.deepEqual(failures, []);
      await page.close();
    }
  for (const mode of ['light', 'dark']) {
    const base = demoSnapshot.commits[0];
    const parents = Array.from({ length: 20 }, (_, i) => (i + 2000).toString(16).padStart(40, '0'));
    const ancestors = Array.from({ length: 20 }, (_, i) =>
      (i + 3000).toString(16).padStart(40, '0'),
    );
    const root = 'f'.repeat(40);
    const history = [
      {
        ...base,
        hash: 'e'.repeat(40),
        parents,
        subject: 'Merge fixture with twenty parents',
        refs: '',
      },
      ...parents.map((hash, i) => ({
        ...base,
        hash,
        parents: [ancestors[i]],
        subject: `Wide branch ${i + 1} with a long commit subject`,
        author: 'Very long author name for graph layout',
        refs: '',
      })),
      ...ancestors.map((hash, i) => ({
        ...base,
        hash,
        parents: [root],
        subject: `Older branch ${i + 1}`,
        refs: '',
      })),
      { ...base, hash: root, parents: [], subject: 'Shared ancestor', refs: '' },
    ];
    const { page, failures } = await fixture(
      'mist',
      mode,
      false,
      { width: 1440, height: 920 },
      0,
      history,
    );
    await page.getByRole('button', { name: '提交历史', exact: true }).click();
    const scrollbar = page.getByRole('region', { name: '提交图谱水平滚动' });
    await scrollbar.waitFor();
    const geometry = () =>
      page
        .locator('.commit-row')
        .first()
        .evaluate((row) => {
          const graph = row.querySelector('.commit-graph-viewport').getBoundingClientRect();
          const text = row.querySelector('.commit-info').getBoundingClientRect();
          const svg = row.querySelector('svg');
          return {
            graphRight: graph.right,
            textLeft: text.left,
            textRight: text.right,
            rowRight: row.getBoundingClientRect().right,
            graphWidth: graph.width,
            textWidth: text.width,
            fullGraphWidth: Number(svg.getAttribute('width')),
          };
        });
    for (const width of [1440, 1000, 800]) {
      await page.setViewportSize({ width, height: 920 });
      await page.waitForTimeout(100);
      const before = await geometry();
      assert.ok(before.fullGraphWidth >= 382, 'graph includes all off-page parent lanes');
      assert.ok(before.graphRight <= before.textLeft, 'graph never overlaps commit text');
      assert.ok(before.textRight <= before.rowRight, 'metadata stays inside its row');
      assert.ok(
        before.textWidth > before.graphWidth,
        'commit information keeps priority in narrow panels',
      );
      await scrollbar.evaluate((element) => {
        element.scrollLeft = element.scrollWidth;
        element.dispatchEvent(new Event('scroll'));
      });
      const after = await geometry();
      assert.equal(
        after.textLeft,
        before.textLeft,
        'horizontal graph scrolling does not move text',
      );
      await page.locator('.commit-row').nth(20).click();
      const visible = await page
        .locator('.commit-row')
        .nth(20)
        .evaluate((row) => {
          const node = row.querySelector('circle').getBoundingClientRect();
          const viewport = row.querySelector('.commit-graph-viewport').getBoundingClientRect();
          return node.left >= viewport.left && node.right <= viewport.right;
        });
      assert.ok(visible, 'selecting a commit reveals its node in a far-right lane');
      await page.screenshot({ path: `${output}/history-wide-${mode}-${width}.png` });
    }
    await checkDesign(page);
    assert.deepEqual(failures, []);
    await page.close();
  }
  for (const mode of ['light', 'dark']) {
    const { page, failures } = await fixture(
      'mist',
      mode,
      false,
      { width: 1000, height: 620 },
      426,
    );
    await page.getByRole('button', { name: '提交历史', exact: true }).click();
    const list = page.locator('.commit-list');
    for (const expected of [200, 300, 400, 426]) {
      await list.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
        element.dispatchEvent(new Event('scroll'));
      });
      await page.waitForFunction(
        (count) => Number(document.querySelector('.history-panel').dataset.loadedCount) >= count,
        expected,
      );
    }
    await list.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
      element.dispatchEvent(new Event('scroll'));
    });
    await page.getByText('Pagination fixture 426', { exact: true }).waitFor();
    assert.ok((await page.locator('.commit-row').count()) < 40, 'older history stays virtualized');
    await checkDesign(page);
    await page.screenshot({ path: `${output}/history-paginated-${mode}.png` });
    assert.deepEqual(failures, []);
    await page.close();
  }
  for (const mode of ['light', 'dark']) {
    const { page, failures } = await fixture('mist', mode);
    for (const [label, selector, filename] of [
      ['提交历史', '.history-workbench', 'history'],
      ['Stash', '.stash-workbench', 'stash'],
      ['仓库连接', '.remote-settings-panel', 'remotes'],
      ['开发工具', '.workflow-panel', 'workflow'],
      ['撤销与恢复', '.recovery-panel', 'recovery'],
      ['工作树', '.worktree-grid', 'worktrees'],
    ]) {
      await page.getByRole('button', { name: label, exact: true }).click();
      await page.locator(selector).waitFor();
      if (filename === 'history') {
        await page.locator('.commit-row').first().click();
        await page.locator('.commit-summary h2').waitFor();
      }
      if (filename === 'remotes')
        await page.getByText('git version UI fixture', { exact: true }).waitFor();
      await checkDesign(page);
      await page.screenshot({ path: `${output}/${filename}-${mode}.png` });
    }
    assert.deepEqual(failures, []);
    assert.equal(await page.getByRole('alert').count(), 0);
    await page.close();
  }
  for (const mode of ['light', 'dark']) {
    const { page, failures } = await fixture('mist', mode);
    await page.getByRole('button', { name: '代码编辑器', exact: true }).click();
    await page.getByLabel('仓库相对文件路径').fill('bytes.bin');
    await page.getByRole('button', { name: '打开', exact: true }).click();
    await page.getByLabel('二进制只读预览').waitFor();
    assert.equal(await page.getByRole('button', { name: '保存', exact: true }).isDisabled(), true);
    await page.screenshot({ path: `${output}/binary-${mode}.png` });
    await page.getByRole('button', { name: '下一页', exact: true }).click();
    await page.waitForFunction(() =>
      window.__fixtureCalls.some((c) => c.method === 'Git.EditorPreview' && c.args[2] === 4096),
    );
    await page.getByRole('button', { name: '快捷启动', exact: true }).click();
    await page.getByRole('button', { name: '运行', exact: true }).waitFor();
    await page.getByRole('tab', { name: '开发环境', exact: true }).click();
    await page.getByText('UI fixture only', { exact: false }).waitFor();
    await checkDesign(page);
    await page.screenshot({ path: `${output}/environment-${mode}.png` });
    assert.equal(
      await page.evaluate(() =>
        window.__fixtureCalls.some((c) => c.method === 'Git.RunDeveloperCommand'),
      ),
      false,
    );
    await page.getByRole('tab', { name: '快捷命令', exact: true }).click();
    await checkDesign(page);
    await page.screenshot({ path: `${output}/commands-${mode}.png` });
    await page.getByRole('button', { name: '运行', exact: true }).click();
    await page.waitForFunction(() =>
      window.__fixtureCalls.some((c) => c.method === 'Git.RunDeveloperCommand'),
    );
    const call = await page.evaluate(() =>
      window.__fixtureCalls.find((c) => c.method === 'Git.RunDeveloperCommand'),
    );
    assert.deepEqual(call.args, [
      demoSnapshot.root,
      { id: 'dev', name: '启动开发服务', command: 'npm run dev', directory: '' },
    ]);
    assert.deepEqual(failures, []);
    await page.close();
  }
  {
    const { page, failures } = await fixture('mist', 'dark', false, { width: 390, height: 780 });
    await page.getByRole('button', { name: '快捷启动', exact: true }).click();
    await page.getByRole('tab', { name: '开发环境', exact: true }).click();
    await page.getByText('UI fixture only', { exact: false }).waitFor();
    const rect = await page.getByRole('dialog').boundingBox();
    assert.ok(
      rect &&
        rect.x >= 0 &&
        rect.x + rect.width <= 391 &&
        rect.y >= 0 &&
        rect.y + rect.height <= 781,
    );
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
      false,
    );
    await page.screenshot({ path: `${output}/development-mobile.png` });
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
    'Workbench UI fixture contracts and visual snapshots passed. Native PTYs are tested separately.',
  );
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
