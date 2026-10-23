// Keep native chrome and terminal defaults on the exact frontend Radix release.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const source = process.argv.includes('--source')
  ? pathToFileURL(resolve(process.argv[process.argv.indexOf('--source') + 1])).href
  : '@radix-ui/colors';
const colors = await import(source);
const names = [
  'slate',
  'gray',
  'sage',
  'sand',
  'blue',
  'jade',
  'bronze',
  'red',
  'amber',
  'iris',
  'ruby',
];
const data = Object.fromEntries(
  names.map((name) => [
    name,
    [name, `${name}Dark`].map((scale) =>
      Array.from({ length: 12 }, (_, i) => colors[scale][`${name}${i + 1}`]),
    ),
  ]),
);
const output = JSON.stringify(data, null, 2) + '\n';
const file = new URL('../radix-native.json', import.meta.url);
if (process.argv.includes('--check')) {
  if ((await readFile(file, 'utf8')).replace(/\r\n/g, '\n') !== output)
    throw new Error('Native Radix colors drifted; run scripts/sync-radix.mjs');
} else await writeFile(file, output);
