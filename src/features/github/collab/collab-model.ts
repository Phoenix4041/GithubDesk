export interface SetDiff {
  added: string[];
  removed: string[];
}

export function diffSets(current: readonly string[], next: readonly string[]): SetDiff {
  const before = new Set(current);
  const after = new Set(next);
  return {
    added: next.filter((item, index) => !before.has(item) && next.indexOf(item) === index),
    removed: current.filter((item, index) => !after.has(item) && current.indexOf(item) === index),
  };
}

export function sameSet(left: readonly string[], right: readonly string[]): boolean {
  const diff = diffSets(left, right);
  return diff.added.length === 0 && diff.removed.length === 0;
}

export function teamKey(slug: string): string {
  return `team:${slug}`;
}

export function splitReviewerKeys(keys: readonly string[]): { users: string[]; teams: string[] } {
  const users: string[] = [];
  const teams: string[] = [];
  for (const key of keys) {
    if (key.startsWith("team:")) {
      teams.push(key.slice("team:".length));
    } else {
      users.push(key);
    }
  }
  return { users, teams };
}

export function filterItems<T extends { label: string; detail?: string }>(items: readonly T[], query: string): T[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") {
    return [...items];
  }
  return items.filter((item) => `${item.label} ${item.detail ?? ""}`.toLowerCase().includes(needle));
}
