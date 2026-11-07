import type { HistoryQuery, HistoryScope } from "@/shared/types/git";

export interface HistoryFilterFields {
  text: string;
  author: string;
  content: string;
  contentRegex: boolean;
  path: string;
  follow: boolean;
  since: string;
  until: string;
  scope: HistoryScope;
}

export const EMPTY_FILTER_FIELDS: HistoryFilterFields = {
  text: "",
  author: "",
  content: "",
  contentRegex: false,
  path: "",
  follow: false,
  since: "",
  until: "",
  scope: "current",
};

function valueOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function isFiltering(fields: HistoryFilterFields): boolean {
  return (
    valueOrNull(fields.text) !== null ||
    valueOrNull(fields.author) !== null ||
    valueOrNull(fields.content) !== null ||
    valueOrNull(fields.path) !== null ||
    valueOrNull(fields.since) !== null ||
    valueOrNull(fields.until) !== null
  );
}

export function buildHistoryQuery(fields: HistoryFilterFields, graph: boolean): HistoryQuery {
  const drawGraph = graph && !isFiltering(fields);
  const path = valueOrNull(fields.path);
  return {
    scope: drawGraph ? "all" : fields.scope,
    text: valueOrNull(fields.text),
    author: valueOrNull(fields.author),
    content: valueOrNull(fields.content),
    contentMode: fields.contentRegex ? "regex" : "text",
    path,
    follow: fields.follow && path !== null,
    since: valueOrNull(fields.since),
    until: valueOrNull(fields.until),
    topoOrder: drawGraph,
  };
}

export function hasContentSearch(query: HistoryQuery): boolean {
  return query.content !== null;
}
