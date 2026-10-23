import { useEffect, useRef } from 'react';
import { basicSetup } from 'codemirror';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import { languages } from '@codemirror/language-data';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { openSearchPanel } from '@codemirror/search';

const colors = HighlightStyle.define([
  { tag: [tags.keyword, tags.modifier, tags.operatorKeyword], color: 'var(--editor-keyword)' },
  { tag: [tags.string, tags.regexp], color: 'var(--editor-string)' },
  { tag: [tags.number, tags.bool, tags.null], color: 'var(--editor-number)' },
  { tag: [tags.comment, tags.meta], color: 'var(--muted)', fontStyle: 'italic' },
  {
    tag: [tags.function(tags.variableName), tags.typeName, tags.className],
    color: 'var(--editor-function)',
  },
]);
const theme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: 'var(--code-size)',
    color: 'var(--ink)',
    backgroundColor: 'var(--panel)',
  },
  '.cm-scroller': { overflow: 'auto', fontFamily: 'var(--mono)', lineHeight: '1.65' },
  '.cm-content': { padding: '12px 0', caretColor: 'var(--ink)' },
  '.cm-gutters': {
    backgroundColor: 'var(--canvas)',
    color: 'var(--muted)',
    borderRight: '0.5px solid var(--line)',
  },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--surface)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--green-soft)',
  },
  '.cm-cursor': { borderLeftColor: 'var(--ink)' },
  '.cm-panels, .cm-tooltip': {
    backgroundColor: 'var(--surface)',
    color: 'var(--ink)',
    borderColor: 'var(--line)',
  },
  '.cm-search input, .cm-search button, .cm-search label': {
    fontSize: '12px',
    background: 'var(--panel)',
    color: 'var(--ink)',
    border: '0.5px solid var(--control-line)',
  },
  '&.cm-focused': { outline: 'none' },
});

export function EditorSurface({
  path,
  content,
  visible,
  onChange,
  onSave,
  onCursor,
  onLanguageError,
  searchRequest,
}: {
  path: string;
  content: string;
  visible: boolean;
  onChange: (text: string) => void;
  onSave: () => void;
  onCursor: (line: number, column: number) => void;
  onLanguageError: () => void;
  searchRequest?: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<EditorView | null>(null);
  const callbacks = useRef({ onChange, onSave, onCursor, onLanguageError });
  callbacks.current = { onChange, onSave, onCursor, onLanguageError };
  useEffect(() => {
    const language = new Compartment();
    const ending = content.includes('\r\n') ? '\r\n' : '\n';
    const view = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: content,
        extensions: [
          basicSetup,
          theme,
          syntaxHighlighting(colors),
          language.of([]),
          EditorState.lineSeparator.of(ending),
          EditorView.contentAttributes.of({
            'aria-label': `编辑代码 ${path}`,
            spellcheck: 'false',
          }),
          keymap.of([
            {
              key: 'Mod-s',
              run: () => {
                callbacks.current.onSave();
                return true;
              },
            },
            indentWithTab,
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged)
              callbacks.current.onChange(
                update.state.doc.sliceString(0, update.state.doc.length, ending),
              );
            if (update.selectionSet || update.docChanged) {
              const pos = update.state.selection.main.head,
                line = update.state.doc.lineAt(pos);
              callbacks.current.onCursor(line.number, pos - line.from + 1);
            }
          }),
        ],
      }),
    });
    editor.current = view;
    let disposed = false;
    const support =
      languages.find((l) => l.filename?.test(path.split('/').at(-1)!)) ||
      languages.find((l) => l.extensions.includes(path.split('.').at(-1)!.toLowerCase()));
    support
      ?.load()
      .then((extension) => {
        if (!disposed) view.dispatch({ effects: language.reconfigure(extension) });
      })
      .catch(() => {
        if (!disposed) callbacks.current.onLanguageError();
      });
    return () => {
      disposed = true;
      view.destroy();
      editor.current = null;
    };
    // One editor instance per open document retains its own undo/selection state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);
  useEffect(() => {
    if (visible) {
      editor.current?.requestMeasure();
      editor.current?.focus();
      const state = editor.current?.state;
      if (state) {
        const pos = state.selection.main.head,
          line = state.doc.lineAt(pos);
        callbacks.current.onCursor(line.number, pos - line.from + 1);
      }
    }
  }, [visible]);
  useEffect(() => {
    if (searchRequest && editor.current) openSearchPanel(editor.current);
  }, [searchRequest]);
  return <div className="editor-surface" ref={host} />;
}
