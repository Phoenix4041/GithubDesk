import type { Profile } from "@/features/profiles/profile-model";
import type { GithubAccount } from "@/shared/types/git";

export interface HomeContext {
  account: GithubAccount | null;
  org: string | null;
  profile: Profile | null;
}

export function homeContext(
  profiles: readonly Profile[],
  activeProfileId: string | null,
  accounts: readonly GithubAccount[],
): HomeContext {
  const profile = profiles.find((candidate) => candidate.id === activeProfileId) ?? null;
  const profileAccount = profile ? accounts.find((candidate) => candidate.id === profile.accountId) : undefined;
  if (profile && profileAccount) {
    return { account: profileAccount, org: profile.org, profile };
  }
  return { account: accounts[0] ?? null, org: null, profile: null };
}

export function contextTitle(context: HomeContext): string {
  if (context.org) {
    return context.org;
  }
  return context.account?.login ?? "";
}

export function hostOfUrl(url: string): string | null {
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.host.toLowerCase() : null;
  } catch {
    return null;
  }
}

export function pickCloneAccount(
  url: string,
  accounts: readonly GithubAccount[],
  preferredAccountId: string | null,
): GithubAccount | null {
  const host = hostOfUrl(url);
  if (host === null) {
    return null;
  }
  const sameHost = accounts.filter((account) => account.host === host);
  return sameHost.find((account) => account.id === preferredAccountId) ?? sameHost[0] ?? null;
}

export function validRepositoryName(name: string): boolean {
  const trimmed = name.trim();
  return /^[A-Za-z0-9._-]{1,100}$/.test(trimmed) && trimmed !== "." && trimmed !== "..";
}

export function suggestedRepositoryName(folderName: string): string {
  const cleaned = folderName.trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned === "." || cleaned === ".." ? "" : cleaned.slice(0, 100);
}
