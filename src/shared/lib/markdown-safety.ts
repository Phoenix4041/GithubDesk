const IMAGE_HOSTS = [/^github\.com$/, /^avatars\.githubusercontent\.com$/, /^[a-z0-9-]+\.githubusercontent\.com$/];

export function isAllowedImageSource(source: string | undefined): boolean {
  if (!source) {
    return false;
  }
  try {
    const url = new URL(source);
    return url.protocol === "https:" && IMAGE_HOSTS.some((pattern) => pattern.test(url.hostname));
  } catch {
    return false;
  }
}
