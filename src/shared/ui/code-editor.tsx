import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import type { LanguageSupport } from "@codemirror/language";
import { syntaxHighlighting } from "@codemirror/language";
import { Compartment, EditorState } from "@codemirror/state";
import type { Extension } from "@codemirror/state";
import { drawSelection, EditorView, keymap, lineNumbers } from "@codemirror/view";
import { classHighlighter } from "@lezer/highlight";
import { useEffect, useImperativeHandle, useMemo, useRef } from "react";
import type { Ref } from "react";
import { cn } from "@/shared/lib/cn";

export interface CodeEditorHandle {
  scrollToLine: (line: number) => void;
}

interface CodeEditorProps {
  value: string;
  ariaLabel: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  language?: LanguageSupport | null;
  extensions?: Extension[];
  className?: string;
  handle?: Ref<CodeEditorHandle>;
}

const FONT_STACK = '"Cascadia Code", "JetBrains Mono", "SF Mono", Consolas, ui-monospace, monospace';

const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    color: "var(--fg)",
    backgroundColor: "var(--surface)",
    fontSize: "12px",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: FONT_STACK,
    fontVariantLigatures: "none",
    lineHeight: "20px",
    overflow: "auto",
  },
  ".cm-content": { caretColor: "var(--fg)" },
  ".cm-gutters": {
    backgroundColor: "var(--canvas)",
    color: "var(--muted)",
    border: "none",
  },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 10px 0 12px" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--fg)" },
  ".cm-selectionBackground": { backgroundColor: "var(--selection)" },
  "&.cm-focused .cm-selectionBackground": { backgroundColor: "var(--selection-focus)" },
});

export function CodeEditor({
  value,
  ariaLabel,
  onChange,
  readOnly = false,
  language = null,
  extensions,
  className,
  handle,
}: CodeEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const initialValue = useRef(value);
  const onChangeRef = useRef(onChange);
  const dynamic = useRef(new Compartment());

  const dynamicExtensions = useMemo<Extension[]>(
    () => [
      EditorState.readOnly.of(readOnly),
      EditorView.editable.of(!readOnly),
      EditorView.contentAttributes.of({ "aria-label": ariaLabel }),
      language ? language : [],
      extensions ?? [],
    ],
    [readOnly, ariaLabel, language, extensions],
  );
  const initialExtensions = useRef(dynamicExtensions);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return undefined;
    }
    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: initialValue.current,
        extensions: [
          lineNumbers(),
          history(),
          drawSelection(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          syntaxHighlighting(classHighlighter),
          editorTheme,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current?.(update.state.doc.toString());
            }
          }),
          dynamic.current.of(initialExtensions.current),
        ],
      }),
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (view && view.state.doc.toString() !== value) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
    }
  }, [value]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: dynamic.current.reconfigure(dynamicExtensions) });
  }, [dynamicExtensions]);

  useImperativeHandle(
    handle,
    () => ({
      scrollToLine: (line: number) => {
        const view = viewRef.current;
        if (!view) {
          return;
        }
        const clamped = Math.min(Math.max(line, 1), view.state.doc.lines);
        const position = view.state.doc.line(clamped).from;
        view.dispatch({ selection: { anchor: position }, effects: EditorView.scrollIntoView(position, { y: "center" }) });
        view.focus();
      },
    }),
    [],
  );

  return <div ref={hostRef} className={cn("min-h-0 min-w-0 flex-1 overflow-hidden", className)} />;
}
