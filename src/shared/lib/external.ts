import { openUrl } from "@tauri-apps/plugin-opener";

const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

export function isSafeExternalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol === "https:") {
      return true;
    }
    return url.protocol === "http:" && LOOPBACK.test(url.host);
  } catch {
    return false;
  }
}

export async function openExternal(value: string): Promise<boolean> {
  if (!isSafeExternalUrl(value)) {
    return false;
  }
  await openUrl(value);
  return true;
}
