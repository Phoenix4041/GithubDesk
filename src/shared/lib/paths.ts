export interface SplitPath {
  directory: string;
  fileName: string;
}

export function splitPath(path: string): SplitPath {
  const normalized = path.replace(/\\/g, "/");
  const separatorIndex = normalized.lastIndexOf("/");
  if (separatorIndex === -1) {
    return { directory: "", fileName: normalized };
  }
  return {
    directory: normalized.slice(0, separatorIndex + 1),
    fileName: normalized.slice(separatorIndex + 1),
  };
}

export function folderNameFromUrl(url: string): string {
  const trimmed = url.trim().replace(/[/\\]+$/, "");
  const lastSegment = trimmed.split(/[/\\:]/).pop() ?? "";
  return lastSegment.replace(/\.git$/i, "");
}

export function joinPath(parent: string, name: string): string {
  if (!parent) {
    return name;
  }
  const separator = parent.includes("\\") ? "\\" : "/";
  const base = parent.endsWith("/") || parent.endsWith("\\") ? parent.slice(0, -1) : parent;
  return `${base}${separator}${name}`;
}

export function extensionOf(path: string): string {
  const { fileName } = splitPath(path);
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex <= 0 ? "" : fileName.slice(dotIndex + 1).toLowerCase();
}
