import type { ParseKeys } from "i18next";
import type { Combo } from "./shortcut-model";

export type CommandGroup =
  | "general"
  | "repository"
  | "navigation"
  | "sync"
  | "branches"
  | "history"
  | "github"
  | "tools";

export const COMMAND_GROUP_ORDER: readonly CommandGroup[] = [
  "general",
  "repository",
  "navigation",
  "sync",
  "branches",
  "history",
  "github",
  "tools",
];

export interface AppCommand {
  id: string;
  titleKey: ParseKeys;
  group: CommandGroup;
  keywords?: string;
  defaultShortcut?: Combo;
  enabled: boolean;
  run: () => void | Promise<void>;
}

export interface SearchableItem {
  title: string;
  keywords?: string;
}

export function normalizeForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function wordStarts(text: string): number[] {
  const starts: number[] = [];
  for (let index = 0; index < text.length; index += 1) {
    const previous = index === 0 ? " " : (text[index - 1] ?? " ");
    if (/[\s\-_/.]/.test(previous) && !/[\s\-_/.]/.test(text[index] ?? " ")) {
      starts.push(index);
    }
  }
  return starts;
}

function subsequenceGaps(text: string, token: string): number | null {
  let position = 0;
  let gaps = 0;
  let last = -1;
  for (const character of token) {
    const found = text.indexOf(character, position);
    if (found === -1) {
      return null;
    }
    if (last !== -1 && found !== last + 1) {
      gaps += 1;
    }
    last = found;
    position = found + 1;
  }
  return gaps;
}

function scoreToken(title: string, keywords: string, token: string): number | null {
  const index = title.indexOf(token);
  if (index !== -1) {
    return wordStarts(title).includes(index) ? 200 - index : 120 - index;
  }
  if (keywords.includes(token)) {
    return 80;
  }
  const gaps = subsequenceGaps(title, token);
  if (gaps !== null && token.length >= 2) {
    return Math.max(10, 50 - gaps * 8);
  }
  return null;
}

export function scoreItem(item: SearchableItem, query: string): number | null {
  const tokens = normalizeForSearch(query).split(/\s+/).filter((token) => token !== "");
  if (tokens.length === 0) {
    return 0;
  }
  const title = normalizeForSearch(item.title);
  const keywords = normalizeForSearch(item.keywords ?? "");
  let total = 0;
  for (const token of tokens) {
    const score = scoreToken(title, keywords, token);
    if (score === null) {
      return null;
    }
    total += score;
  }
  return total;
}

export function rankItems<T extends SearchableItem>(items: readonly T[], query: string): T[] {
  if (query.trim() === "") {
    return [...items];
  }
  const scored: Array<{ item: T; score: number; order: number }> = [];
  items.forEach((item, order) => {
    const score = scoreItem(item, query);
    if (score !== null) {
      scored.push({ item, score, order });
    }
  });
  scored.sort((left, right) => right.score - left.score || left.order - right.order);
  return scored.map((entry) => entry.item);
}
