export type ConflictBlock = { start: number; end: number; ours: string; theirs: string };

// Offsets refer to the original string so CRLF, blank lines and the rest of
// Git's automatically merged result stay byte-for-byte untouched.
export function conflictBlocks(text: string): ConflictBlock[] {
  const lines = text.match(/[^\n]*\n|[^\n]+$/g) || [];
  const result: ConflictBlock[] = [];
  let offset = 0;
  let start = -1;
  let ours = '';
  let theirs = '';
  let side: 'ours' | 'base' | 'theirs' = 'ours';
  for (const line of lines) {
    if (/^<{7}(?: |\r?$)/.test(line)) {
      start = offset;
      ours = '';
      theirs = '';
      side = 'ours';
    } else if (start >= 0 && /^\|{7}(?: |\r?$)/.test(line)) {
      side = 'base';
    } else if (start >= 0 && /^={7}\r?(?:\n)?$/.test(line)) {
      side = 'theirs';
    } else if (start >= 0 && /^>{7}(?: |\r?$)/.test(line)) {
      result.push({ start, end: offset + line.length, ours, theirs });
      start = -1;
    } else if (start >= 0) {
      if (side === 'ours') ours += line;
      if (side === 'theirs') theirs += line;
    }
    offset += line.length;
  }
  return result;
}

export function hasConflictMarkers(text: string) {
  return /^(?:<{7}|={7}|>{7}|\|{7})/m.test(text);
}

export function resolveBlock(
  text: string,
  block: ConflictBlock,
  choice: 'ours' | 'theirs' | 'both',
) {
  const replacement =
    choice === 'ours' ? block.ours : choice === 'theirs' ? block.theirs : block.ours + block.theirs;
  return text.slice(0, block.start) + replacement + text.slice(block.end);
}
