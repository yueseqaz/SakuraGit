import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const targets = ['darwin/universal', 'windows/amd64', 'windows/arm64', 'linux/amd64', 'linux/arm64'];

export function checkVersion(root, tag) {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const config = JSON.parse(readFileSync(join(root, 'mygo.json'), 'utf8'));
  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
  const version = pkg.version;
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error('Invalid package version');
  if (config.version !== version || lock.version !== version || lock.packages[''].version !== version)
    throw new Error('Package, lockfile, and MyGo versions must match');
  for (const [file, text] of [
    ['main.go', `SetVersion("${version}")`],
    ['src/App.tsx', `v${version}`],
    ['src/SettingsPanel.tsx', `SakuraGit ${version}`],
  ]) {
    if (!readFileSync(join(root, file), 'utf8').includes(text)) throw new Error(`Version mismatch in ${file}`);
  }
  if (tag !== undefined && tag !== `v${version}`) throw new Error('Tag must equal v<application version>');
  return version;
}

export function assetNames(version, target) {
  if (!targets.includes(target)) throw new Error(`Unsupported release target: ${target}`);
  const [os, arch] = target.split('/');
  const prefix = `SakuraGit-${version}-${os === 'darwin' ? 'macos' : os}-${arch}`;
  if (os === 'darwin') return [`${prefix}.dmg`];
  if (os === 'windows') return [`${prefix}-setup.exe`];
  return [`${prefix}.deb`, `${prefix}.tar.gz`];
}

export function verifyBinary(bytes, target) {
  const [os, arch] = target.split('/');
  if (os === 'linux') {
    if (bytes.length < 20 || bytes.subarray(0, 4).toString('hex') !== '7f454c46' || bytes[4] !== 2 || bytes[5] !== 1 ||
      bytes.readUInt16LE(18) !== (arch === 'amd64' ? 62 : 183)) throw new Error('ELF architecture mismatch');
  } else if (os === 'windows') {
    if (bytes.length < 64 || bytes.subarray(0, 2).toString() !== 'MZ') throw new Error('Invalid PE file');
    const offset = bytes.readUInt32LE(60);
    if (offset + 6 > bytes.length || bytes.subarray(offset, offset + 4).toString('hex') !== '50450000' ||
      bytes.readUInt16LE(offset + 4) !== (arch === 'amd64' ? 0x8664 : 0xaa64)) throw new Error('PE architecture mismatch');
  } else if (os !== 'darwin') throw new Error('Unsupported binary format');
}

export function collect(root, target) {
  const version = checkVersion(root);
  const names = assetNames(version, target);
  const [os] = target.split('/');
  const stage = join(root, 'build', target.replace('/', '-'));
  const library = os === 'darwin' ? 'libghostty-vt.dylib' : os === 'windows' ? 'ghostty-vt.dll' : 'libghostty-vt.so';
  const libraries = [];
  const findLibrary = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) findLibrary(path);
      else if (entry.isFile() && entry.name === library) libraries.push(path);
    }
  };
  findLibrary(stage);
  if (libraries.length !== 1) throw new Error(`Expected exactly one bundled ${library}, found ${libraries.length}`);
  if (!statSync(libraries[0]).size) throw new Error('Terminal library is empty');
  if (os !== 'darwin') {
    verifyBinary(readFileSync(join(stage, os === 'windows' ? 'SakuraGit.exe' : 'sakuragit')), target);
    verifyBinary(readFileSync(libraries[0]), target);
  }
  const files = readdirSync(stage);
  const suffixes = os === 'darwin' ? ['.dmg'] : os === 'windows' ? ['.exe'] : ['.deb', '.tar.gz'];
  const destination = join(root, 'release-assets');
  mkdirSync(destination, { recursive: true });
  suffixes.forEach((suffix, index) => {
    const found = files.filter((name) => name.endsWith(suffix) && (os !== 'windows' || name.startsWith('SakuraGit Setup ')));
    if (found.length !== 1) throw new Error(`Expected one ${suffix} package in ${stage}, found ${found.length}`);
    const source = join(stage, found[0]);
    if (!statSync(source).isFile() || statSync(source).size === 0) throw new Error(`Empty or invalid package: ${source}`);
    copyFileSync(source, join(destination, names[index]));
  });
  return names;
}

export function checksums(root, version) {
  const directory = join(root, 'release-assets');
  const expected = targets.flatMap((target) => assetNames(version, target)).sort();
  const actual = readdirSync(directory).filter((name) => name !== 'SHA256SUMS').sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('Release assets are missing, unexpected, or duplicated');
  const lines = expected.map((name) => {
    const bytes = readFileSync(join(directory, name));
    if (!bytes.length) throw new Error(`Empty asset: ${name}`);
    return `${createHash('sha256').update(bytes).digest('hex')}  ${name}`;
  });
  writeFileSync(join(directory, 'SHA256SUMS'), `${lines.join('\n')}\n`);
  return expected;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, argument] = process.argv.slice(2);
  const root = process.cwd();
  if (command === 'check-version') console.log(checkVersion(root, argument));
  else if (command === 'collect') console.log(collect(root, argument));
  else if (command === 'checksums') console.log(checksums(root, checkVersion(root)));
  else throw new Error('Expected check-version, collect, or checksums');
}
