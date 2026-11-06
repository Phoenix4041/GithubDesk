import type { LanguageSupport } from "@codemirror/language";
import { classHighlighter, highlightTree } from "@lezer/highlight";
import { extensionOf } from "./paths";

export interface HighlightSegment {
  text: string;
  className: string | null;
}

type LanguageLoader = () => Promise<LanguageSupport>;

const MAX_HIGHLIGHT_LENGTH = 1200;

const loaders: Record<string, LanguageLoader> = {
  js: () => import("@codemirror/lang-javascript").then((module) => module.javascript()),
  mjs: () => import("@codemirror/lang-javascript").then((module) => module.javascript()),
  cjs: () => import("@codemirror/lang-javascript").then((module) => module.javascript()),
  jsx: () => import("@codemirror/lang-javascript").then((module) => module.javascript({ jsx: true })),
  ts: () => import("@codemirror/lang-javascript").then((module) => module.javascript({ typescript: true })),
  tsx: () =>
    import("@codemirror/lang-javascript").then((module) => module.javascript({ typescript: true, jsx: true })),
  json: () => import("@codemirror/lang-json").then((module) => module.json()),
  css: () => import("@codemirror/lang-css").then((module) => module.css()),
  html: () => import("@codemirror/lang-html").then((module) => module.html()),
  htm: () => import("@codemirror/lang-html").then((module) => module.html()),
  md: () => import("@codemirror/lang-markdown").then((module) => module.markdown()),
  markdown: () => import("@codemirror/lang-markdown").then((module) => module.markdown()),
  rs: () => import("@codemirror/lang-rust").then((module) => module.rust()),
  py: () => import("@codemirror/lang-python").then((module) => module.python()),
  yml: () => import("@codemirror/lang-yaml").then((module) => module.yaml()),
  yaml: () => import("@codemirror/lang-yaml").then((module) => module.yaml()),
};

const languageCache = new Map<string, Promise<LanguageSupport | null>>();

export function loadLanguageFor(path: string): Promise<LanguageSupport | null> {
  const extension = extensionOf(path);
  const loader = loaders[extension];
  if (!loader) {
    return Promise.resolve(null);
  }
  const cached = languageCache.get(extension);
  if (cached) {
    return cached;
  }
  const pending = loader().catch(() => null);
  languageCache.set(extension, pending);
  return pending;
}

export function highlightLine(support: LanguageSupport, text: string): HighlightSegment[] {
  if (text.length === 0 || text.length > MAX_HIGHLIGHT_LENGTH) {
    return [{ text, className: null }];
  }
  const tree = support.language.parser.parse(text);
  const segments: HighlightSegment[] = [];
  let position = 0;
  highlightTree(tree, classHighlighter, (from, to, classes) => {
    if (from > position) {
      segments.push({ text: text.slice(position, from), className: null });
    }
    segments.push({ text: text.slice(from, to), className: classes });
    position = to;
  });
  if (position < text.length) {
    segments.push({ text: text.slice(position), className: null });
  }
  return segments.length > 0 ? segments : [{ text, className: null }];
}
