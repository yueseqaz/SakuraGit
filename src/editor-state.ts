export type EditorDocument = {
  root: string;
  path: string;
  original: string;
  content: string;
  revision: string;
};
export const documentID = (root: string, path: string) => JSON.stringify([root, path]);
const key = ['gitlane', 'editor-drafts', 'v1'].join('.');
export const dirtyDocument = (d: EditorDocument) => d.original !== d.content;
export function readEditorDrafts(): EditorDocument[] {
  try {
    const raw = localStorage.getItem(key) || '[]';
    if (raw.length > 8 << 20) return [];
    const docs: unknown = JSON.parse(raw);
    if (!Array.isArray(docs) || docs.length > 16) return [];
    const seen = new Set<string>();
    return docs.filter((d): d is EditorDocument => {
      if (
        !d ||
        typeof d.root !== 'string' ||
        !/^(\/|[A-Za-z]:[\\/])/.test(d.root) ||
        typeof d.path !== 'string' ||
        !d.path ||
        d.path.length > 4096 ||
        typeof d.content !== 'string' ||
        typeof d.original !== 'string' ||
        d.content.length > 1 << 20 ||
        d.original.length > 1 << 20 ||
        typeof d.revision !== 'string' ||
        !/^[a-f0-9]{64}$/.test(d.revision)
      )
        return false;
      const id = documentID(d.root, d.path);
      if (seen.has(id)) return false;
      seen.add(id);
      return dirtyDocument(d);
    });
  } catch {
    return [];
  }
}
export function cacheEditorDrafts(documents: EditorDocument[]) {
  try {
    const value = JSON.stringify(documents.filter(dirtyDocument));
    if (value.length > 8 << 20) return false;
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
