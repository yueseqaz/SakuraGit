import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { assetNames, checkVersion, checksums, collect, targets, verifyBinary } from './release-tools.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'sakuragit-release-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '0.5.2' }));
  writeFileSync(join(root, 'mygo.json'), JSON.stringify({ version: '0.5.2' }));
  writeFileSync(join(root, 'package-lock.json'), JSON.stringify({ version: '0.5.2', packages: { '': { version: '0.5.2' } } }));
  writeFileSync(join(root, 'main.go'), 'mygo.App.SetVersion("0.5.2")');
  writeFileSync(join(root, 'src/App.tsx'), 'v0.5.2');
  writeFileSync(join(root, 'src/SettingsPanel.tsx'), 'SakuraGit 0.5.2');
  return root;
}
function elf(machine = 62) {
  const buffer = Buffer.alloc(64);
  buffer.write('\x7fELF'); buffer[4] = 2; buffer[5] = 1; buffer.writeUInt16LE(machine, 18);
  return buffer;
}
function pe(machine = 0x8664) {
  const buffer = Buffer.alloc(128);
  buffer.write('MZ'); buffer.writeUInt32LE(64, 60); buffer.write('PE\x00\x00', 64); buffer.writeUInt16LE(machine, 68);
  return buffer;
}
test('version gates reject mismatched metadata, tags, and UI versions', (t) => {
  const root = fixture(t);
  assert.equal(checkVersion(root, 'v0.5.2'), '0.5.2');
  assert.throws(() => checkVersion(root, 'v0.5.3'));
  writeFileSync(join(root, 'src/App.tsx'), 'v0.5.1');
  assert.throws(() => checkVersion(root));
  writeFileSync(join(root, 'mygo.json'), '{"version":"0.5.1"}');
  assert.throws(() => checkVersion(root));
});
test('every target gets unique, shell-safe release names', () => {
  const names = targets.flatMap((target) => assetNames('0.5.2', target));
  assert.equal(names.length, 7);
  assert.equal(new Set(names).size, 7);
  assert.ok(names.every((name) => /^[A-Za-z0-9.-]+$/.test(name)));
  assert.throws(() => assetNames('0.5.2', '../unexpected'));
});
test('PE and ELF architectures are checked rather than trusting the asset name', () => {
  verifyBinary(elf(), 'linux/amd64'); verifyBinary(elf(183), 'linux/arm64');
  verifyBinary(pe(), 'windows/amd64'); verifyBinary(pe(0xaa64), 'windows/arm64');
  assert.throws(() => verifyBinary(elf(), 'linux/arm64'));
  assert.throws(() => verifyBinary(pe(), 'windows/arm64'));
  assert.throws(() => verifyBinary(Buffer.alloc(2), 'windows/amd64'));
  const bad = pe(); bad.writeUInt32LE(1000, 60);
  assert.throws(() => verifyBinary(bad, 'windows/amd64'));
});
test('collect requires actual packages and the correct executable architecture', (t) => {
  const root = fixture(t), stage = join(root, 'build/linux-amd64');
  mkdirSync(stage, { recursive: true });
  writeFileSync(join(stage, 'sakuragit'), elf());
  writeFileSync(join(stage, 'app.deb'), 'deb');
  assert.throws(() => collect(root, 'linux/amd64'));
  writeFileSync(join(stage, 'app.tar.gz'), 'tar');
  assert.throws(() => collect(root, 'linux/amd64'), /bundled libghostty-vt/);
  writeFileSync(join(stage, 'libghostty-vt.so'), elf(183));
  assert.throws(() => collect(root, 'linux/amd64'), /architecture mismatch/);
  writeFileSync(join(stage, 'libghostty-vt.so'), elf());
  assert.deepEqual(collect(root, 'linux/amd64'), assetNames('0.5.2', 'linux/amd64'));
  writeFileSync(join(stage, 'sakuragit'), elf(183));
  assert.throws(() => collect(root, 'linux/amd64'));
});
test('checksums require the complete seven-package set and are repeatable', (t) => {
  const root = fixture(t), directory = join(root, 'release-assets');
  mkdirSync(directory);
  for (const name of targets.flatMap((target) => assetNames('0.5.2', target))) writeFileSync(join(directory, name), name);
  checksums(root, '0.5.2');
  const first = readFileSync(join(directory, 'SHA256SUMS'), 'utf8');
  assert.equal(first.trim().split('\n').length, 7);
  checksums(root, '0.5.2');
  assert.equal(readFileSync(join(directory, 'SHA256SUMS'), 'utf8'), first);
  writeFileSync(join(directory, 'unexpected.exe'), 'unexpected');
  assert.throws(() => checksums(root, '0.5.2'));
  rmSync(join(directory, 'unexpected.exe'));
  rmSync(join(directory, assetNames('0.5.2', targets[0])[0]));
  assert.throws(() => checksums(root, '0.5.2'));
});
