import type { IgnoreTemplate } from "./templates";

function activeLines(content: string): Set<string> {
  const lines = new Set<string>();
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (line !== "" && !line.startsWith("#")) {
      lines.add(line);
    }
  }
  return lines;
}

export function templateHeader(template: IgnoreTemplate): string {
  return `# ${template.name}`;
}

export function isTemplateApplied(content: string, template: IgnoreTemplate): boolean {
  return content.split(/\r?\n/).some((line) => line.trim() === templateHeader(template));
}

export interface MergeResult {
  content: string;
  added: number;
}

export function mergeTemplate(content: string, template: IgnoreTemplate): MergeResult {
  const present = activeLines(content);
  const additions = template.lines.filter((line, index) => !present.has(line) && template.lines.indexOf(line) === index);
  if (additions.length === 0) {
    return { content, added: 0 };
  }
  let result = content;
  if (result !== "" && !result.endsWith("\n")) {
    result += "\n";
  }
  if (result !== "") {
    result += "\n";
  }
  result += `${templateHeader(template)}\n${additions.join("\n")}\n`;
  return { content: result, added: additions.length };
}

const GLOB_SPECIALS = /[\\*?[\]]/g;

function escapeGlob(value: string): string {
  let escaped = value.replace(GLOB_SPECIALS, (character) => `\\${character}`);
  if (escaped.endsWith(" ")) {
    escaped = `${escaped.slice(0, -1)}\\ `;
  }
  return escaped;
}

export function ignorePatternForPath(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/^\/+/, "");
  return `/${escapeGlob(normalized)}`;
}

export function ignorePatternForExtension(path: string): string | null {
  const normalized = path.replace(/\\/g, "/");
  const fileName = normalized.slice(normalized.lastIndexOf("/") + 1);
  const dot = fileName.lastIndexOf(".");
  if (dot <= 0 || dot === fileName.length - 1) {
    return null;
  }
  return `*${escapeGlob(fileName.slice(dot))}`;
}

export function ignorePatternForFolder(path: string): string | null {
  const normalized = path.replace(/\\/g, "/").replace(/^\/+/, "");
  const slash = normalized.lastIndexOf("/");
  if (slash <= 0) {
    return null;
  }
  return `/${escapeGlob(normalized.slice(0, slash))}/`;
}
