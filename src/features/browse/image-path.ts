const IMAGE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
};

function extensionOf(path: string): string {
  const name = path.split("/").pop() ?? path;
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export function imageMimeType(path: string): string | null {
  return IMAGE_TYPES[extensionOf(path)] ?? null;
}

export function isImagePath(path: string): boolean {
  return imageMimeType(path) !== null;
}

export function imageDataUrl(path: string, base64: string): string | null {
  const mime = imageMimeType(path);
  return mime ? `data:${mime};base64,${base64}` : null;
}
