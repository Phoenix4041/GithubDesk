import { RangeSetBuilder } from "@codemirror/state";
import type { Extension } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin } from "@codemirror/view";
import type { DecorationSet, ViewUpdate } from "@codemirror/view";
import { parseConflictRegions } from "./conflict-model";

const oursLine = Decoration.line({ class: "cm-conflict-ours" });
const theirsLine = Decoration.line({ class: "cm-conflict-theirs" });
const baseLine = Decoration.line({ class: "cm-conflict-base" });
const markerLine = Decoration.line({ class: "cm-conflict-marker" });

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const { doc } = view.state;
  const regions = parseConflictRegions(doc.toString());

  const add = (zeroBasedLine: number, decoration: Decoration) => {
    if (zeroBasedLine + 1 <= doc.lines) {
      const line = doc.line(zeroBasedLine + 1);
      builder.add(line.from, line.from, decoration);
    }
  };

  for (const region of regions) {
    let line = region.startLine;
    add(line, markerLine);
    line += 1;
    for (let index = 0; index < region.ours.length; index += 1) {
      add(line, oursLine);
      line += 1;
    }
    if (region.base) {
      add(line, markerLine);
      line += 1;
      for (let index = 0; index < region.base.length; index += 1) {
        add(line, baseLine);
        line += 1;
      }
    }
    add(line, markerLine);
    line += 1;
    for (let index = 0; index < region.theirs.length; index += 1) {
      add(line, theirsLine);
      line += 1;
    }
    add(line, markerLine);
  }
  return builder.finish();
}

const conflictPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

const conflictTheme = EditorView.baseTheme({
  ".cm-conflict-ours": { backgroundColor: "var(--conflict-ours)" },
  ".cm-conflict-theirs": { backgroundColor: "var(--conflict-theirs)" },
  ".cm-conflict-base": { backgroundColor: "var(--conflict-base)" },
  ".cm-conflict-marker": {
    backgroundColor: "var(--hunk-bg)",
    color: "var(--muted)",
    fontWeight: "600",
  },
});

export function conflictHighlighting(): Extension {
  return [conflictPlugin, conflictTheme];
}
