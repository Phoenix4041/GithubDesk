import type { CapabilityStatus, TokenInfo } from "@/shared/types/git";

const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
const MILLISECONDS_PER_DAY = 86_400_000;

export function missingCapabilities(info: TokenInfo): CapabilityStatus[] {
  return info.capabilities.filter((capability) => capability.granted === false);
}

export function preselectedCapabilities(info: TokenInfo, wantedScopes: readonly string[], wantedIds: readonly string[]): Set<string> {
  const selected = new Set<string>();
  for (const capability of missingCapabilities(info)) {
    if (wantedIds.includes(capability.id) || capability.request.some((scope) => wantedScopes.includes(scope))) {
      selected.add(capability.id);
    }
  }
  return selected;
}

export function scopesToRequest(info: TokenInfo, selected: ReadonlySet<string>): string[] {
  const scopes = new Set(info.scopes ?? []);
  for (const capability of info.capabilities) {
    if (selected.has(capability.id)) {
      for (const scope of capability.request) {
        scopes.add(scope);
      }
    }
  }
  return Array.from(scopes);
}

export function webBase(host: string): string {
  return `${LOOPBACK.test(host) ? "http" : "https"}://${host}`;
}

export function tokenCreationUrl(host: string, scopes: readonly string[], description = "GithubDesk"): string {
  const query = new URLSearchParams({ scopes: scopes.join(","), description });
  return `${webBase(host)}/settings/tokens/new?${query.toString()}`;
}

export function tokensPageUrl(host: string): string {
  return `${webBase(host)}/settings/tokens`;
}

export function authorizedAppsUrl(host: string): string {
  return `${webBase(host)}/settings/applications`;
}

export function daysUntil(isoDate: string | null, nowMilliseconds = Date.now()): number | null {
  if (!isoDate) {
    return null;
  }
  const target = Date.parse(isoDate);
  if (Number.isNaN(target)) {
    return null;
  }
  return Math.ceil((target - nowMilliseconds) / MILLISECONDS_PER_DAY);
}

export function scopesFromErrorDetail(detail: string): string[] {
  return detail
    .split(",")
    .map((scope) => scope.trim())
    .filter((scope) => scope.length > 0);
}
