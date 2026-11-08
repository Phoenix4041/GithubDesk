export interface Coauthor {
  name: string;
  email: string;
}

export type IssuePrefixMode = "off" | "title" | "refs";

const TRAILER_PATTERN = /^co-authored-by:\s*.*<([^>]+)>\s*$/i;
const ISSUE_PATTERN = /(?:^|[-_])(?:gh-?)?(\d{1,7})(?=$|[-_.])/i;

export function coauthorTrailer(person: Coauthor): string {
  return `Co-authored-by: ${person.name.trim()} <${person.email.trim()}>`;
}

function trailerEmails(text: string): Set<string> {
  const emails = new Set<string>();
  for (const line of text.split("\n")) {
    const match = TRAILER_PATTERN.exec(line.trim());
    if (match?.[1]) {
      emails.add(match[1].trim().toLowerCase());
    }
  }
  return emails;
}

function endsWithTrailerBlock(text: string): boolean {
  const lines = text.split("\n");
  const last = lines[lines.length - 1]?.trim() ?? "";
  return TRAILER_PATTERN.test(last);
}

export function appendCoauthors(description: string, people: readonly Coauthor[]): string {
  const body = description.replace(/\r\n/g, "\n").trimEnd();
  const present = trailerEmails(body);
  const additions: string[] = [];
  for (const person of people) {
    const email = person.email.trim().toLowerCase();
    if (email.length === 0 || person.name.trim().length === 0 || present.has(email)) {
      continue;
    }
    present.add(email);
    additions.push(coauthorTrailer(person));
  }
  if (additions.length === 0) {
    return body;
  }
  if (body.length === 0) {
    return additions.join("\n");
  }
  const separator = endsWithTrailerBlock(body) ? "\n" : "\n\n";
  return `${body}${separator}${additions.join("\n")}`;
}

export function issueNumberFromBranch(branch: string | null): number | null {
  if (!branch) {
    return null;
  }
  const segments = branch.split("/").reverse();
  for (const segment of segments) {
    const match = ISSUE_PATTERN.exec(segment);
    if (match?.[1]) {
      const value = Number.parseInt(match[1], 10);
      if (value > 0) {
        return value;
      }
    }
  }
  return null;
}

export function applyIssueToTitle(title: string, issue: number): string {
  const trimmed = title.trimStart();
  if (new RegExp(`^#${issue}\\b`).test(trimmed)) {
    return title;
  }
  return trimmed.length === 0 ? `#${issue}: ` : `#${issue}: ${trimmed}`;
}

export function applyIssueRefs(description: string, issue: number): string {
  const body = description.replace(/\r\n/g, "\n").trimEnd();
  if (new RegExp(`(^|\\n)Refs #${issue}\\b`, "i").test(body)) {
    return body;
  }
  return body.length === 0 ? `Refs #${issue}` : `${body}\n\nRefs #${issue}`;
}
