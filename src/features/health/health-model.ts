export function parseFolderList(text: string): string[] {
  const seen = new Set<string>();
  const folders: string[] = [];
  for (const raw of text.split(/[\r\n,]+/)) {
    const folder = raw.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    if (folder.length > 0 && !seen.has(folder)) {
      seen.add(folder);
      folders.push(folder);
    }
  }
  return folders;
}

export function isSafeFolder(folder: string): boolean {
  if (/^[A-Za-z]:/.test(folder) || folder.startsWith("/")) {
    return false;
  }
  return folder.split("/").every((part) => part.length > 0 && part !== "." && part !== "..");
}

export function savedBytes(before: number, after: number): number {
  return Math.max(0, before - after);
}
