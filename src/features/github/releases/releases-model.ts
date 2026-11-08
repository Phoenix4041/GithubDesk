export interface ReleaseAsset {
  id: number;
  name: string;
  size: number;
  downloadCount: number;
  contentType: string;
  browserDownloadUrl: string;
}

export interface Release {
  id: number;
  tagName: string;
  name: string | null;
  body: string | null;
  draft: boolean;
  prerelease: boolean;
  targetCommitish: string;
  createdAt: string;
  publishedAt: string | null;
  htmlUrl: string;
  author: { login: string } | null;
  assets: ReleaseAsset[];
}

export interface NewRelease {
  tagName: string;
  target: string | null;
  name: string;
  body: string;
  draft: boolean;
  prerelease: boolean;
}

export type ReleaseStatus = "draft" | "prerelease" | "published";

export function releaseStatus(release: Pick<Release, "draft" | "prerelease">): ReleaseStatus {
  if (release.draft) {
    return "draft";
  }
  return release.prerelease ? "prerelease" : "published";
}

export function releaseTitle(release: Pick<Release, "name" | "tagName">): string {
  const name = release.name?.trim();
  return name ? name : release.tagName;
}

export function tagProblem(tag: string): "empty" | "invalid" | null {
  const trimmed = tag.trim();
  if (trimmed === "") {
    return "empty";
  }
  const bad = /[\s~^:?*[\\]/.test(trimmed) || trimmed.includes("..") || trimmed.startsWith("-");
  return bad ? "invalid" : null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value >= 10 ? Math.round(value) : Math.round(value * 10) / 10} ${units[index] ?? "GB"}`;
}

export function previousTagOf(tags: readonly string[], current: string): string | null {
  const index = tags.indexOf(current);
  if (index !== -1) {
    return tags[index + 1] ?? null;
  }
  return tags[0] ?? null;
}

export function normalizeColor(color: string): string | null {
  const hex = color.trim().replace(/^#/, "").toLowerCase();
  return /^[0-9a-f]{6}$/.test(hex) ? hex : null;
}

export function dueDateToIso(date: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T00:00:00Z` : null;
}

export function isoToDueDate(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}
