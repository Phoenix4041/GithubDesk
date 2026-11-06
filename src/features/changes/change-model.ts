import type { ChangeKind, DiffSource, StatusEntry } from "@/shared/types/git";

export type ChangeSection = "conflicts" | "staged" | "unstaged";

export type ChangeRow =
  | { kind: "section"; section: ChangeSection; count: number }
  | { kind: "file"; section: ChangeSection; entry: StatusEntry };

export interface ChangeModel {
  rows: ChangeRow[];
  conflicts: StatusEntry[];
  staged: StatusEntry[];
  unstaged: StatusEntry[];
}

export function buildChangeModel(entries: readonly StatusEntry[]): ChangeModel {
  const conflicts = entries.filter((entry) => entry.conflicted);
  const staged = entries.filter(
    (entry) => !entry.conflicted && !entry.untracked && entry.index !== "unmodified",
  );
  const unstaged = entries.filter((entry) => !entry.conflicted && entry.worktree !== "unmodified");

  const rows: ChangeRow[] = [];
  const sections: Array<[ChangeSection, StatusEntry[]]> = [
    ["conflicts", conflicts],
    ["staged", staged],
    ["unstaged", unstaged],
  ];
  for (const [section, items] of sections) {
    if (items.length === 0) {
      continue;
    }
    rows.push({ kind: "section", section, count: items.length });
    for (const entry of items) {
      rows.push({ kind: "file", section, entry });
    }
  }
  return { rows, conflicts, staged, unstaged };
}

export function diffSourceFor(section: ChangeSection, entry: StatusEntry): DiffSource {
  if (section === "conflicts" || entry.untracked) {
    return "raw";
  }
  return section === "staged" ? "staged" : "unstaged";
}

export function effectiveChange(section: ChangeSection, entry: StatusEntry): ChangeKind {
  if (section === "conflicts") {
    return "unmerged";
  }
  return section === "staged" ? entry.index : entry.worktree;
}

export interface ChangeBadge {
  letter: string;
  tone: "success" | "warning" | "danger" | "accent" | "muted";
}

export function badgeFor(kind: ChangeKind): ChangeBadge {
  switch (kind) {
    case "added":
    case "untracked":
      return { letter: kind === "untracked" ? "U" : "A", tone: "success" };
    case "modified":
      return { letter: "M", tone: "warning" };
    case "deleted":
      return { letter: "D", tone: "danger" };
    case "renamed":
      return { letter: "R", tone: "accent" };
    case "copied":
      return { letter: "C", tone: "accent" };
    case "typeChanged":
      return { letter: "T", tone: "warning" };
    case "unmerged":
      return { letter: "!", tone: "danger" };
    default:
      return { letter: "", tone: "muted" };
  }
}

export function findRow(
  rows: readonly ChangeRow[],
  section: ChangeSection,
  path: string,
): Extract<ChangeRow, { kind: "file" }> | null {
  for (const row of rows) {
    if (row.kind === "file" && row.section === section && row.entry.path === path) {
      return row;
    }
  }
  return null;
}

export function firstFileRow(rows: readonly ChangeRow[]): Extract<ChangeRow, { kind: "file" }> | null {
  for (const row of rows) {
    if (row.kind === "file") {
      return row;
    }
  }
  return null;
}
