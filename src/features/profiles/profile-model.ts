import type { GithubAccount, Identity, RemoteRepo, SigningFormat } from "@/shared/types/git";

export interface Profile {
  id: string;
  label: string;
  accountId: string;
  org: string | null;
  name: string;
  email: string;
  signingKey: string | null;
  signingFormat: SigningFormat;
}

export type ProfileDraft = Omit<Profile, "id">;

export interface ProfileErrors {
  label?: "required";
  accountId?: "required";
  name?: "required";
  email?: "required" | "invalid";
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function newProfileId(): string {
  return crypto.randomUUID();
}

export function noreplyEmail(account: Pick<GithubAccount, "login" | "userId">): string {
  const prefix = account.userId === null ? "" : `${account.userId}+`;
  return `${prefix}${account.login}@users.noreply.github.com`;
}

export function defaultDraft(account: GithubAccount, org: string | null): ProfileDraft {
  return {
    label: org ?? account.login,
    accountId: account.id,
    org,
    name: account.name ?? account.login,
    email: noreplyEmail(account),
    signingKey: null,
    signingFormat: "openpgp",
  };
}

export function validateProfile(draft: ProfileDraft): ProfileErrors {
  const errors: ProfileErrors = {};
  if (draft.label.trim() === "") {
    errors.label = "required";
  }
  if (draft.accountId === "") {
    errors.accountId = "required";
  }
  if (draft.name.trim() === "") {
    errors.name = "required";
  }
  if (draft.email.trim() === "") {
    errors.email = "required";
  } else if (!EMAIL_PATTERN.test(draft.email.trim())) {
    errors.email = "invalid";
  }
  return errors;
}

export function hasErrors(errors: ProfileErrors): boolean {
  return Object.keys(errors).length > 0;
}

export function normalizeDraft(draft: ProfileDraft): ProfileDraft {
  return {
    ...draft,
    label: draft.label.trim(),
    name: draft.name.trim(),
    email: draft.email.trim(),
    signingKey: draft.signingKey?.trim() ? draft.signingKey.trim() : null,
  };
}

export function profileOwner(profile: Profile, accounts: readonly GithubAccount[]): string | null {
  if (profile.org) {
    return profile.org;
  }
  return accounts.find((account) => account.id === profile.accountId)?.login ?? null;
}

export function suggestProfile(
  profiles: readonly Profile[],
  accounts: readonly GithubAccount[],
  remote: RemoteRepo,
): Profile | null {
  const owner = remote.owner.toLowerCase();
  const matching = profiles.filter((profile) => {
    const account = accounts.find((candidate) => candidate.id === profile.accountId);
    if (!account || account.host !== remote.host) {
      return false;
    }
    return profileOwner(profile, accounts)?.toLowerCase() === owner;
  });
  return matching.find((profile) => profile.org !== null) ?? matching[0] ?? null;
}

export function identityMatches(identity: Identity, profile: Profile): boolean {
  const sameName = identity.name?.value === profile.name;
  const sameEmail = identity.email?.value.toLowerCase() === profile.email.toLowerCase();
  const sameKey = (identity.signingKey?.value ?? null) === profile.signingKey;
  return sameName && sameEmail && sameKey;
}

export function identityIsMissing(identity: Identity): boolean {
  return identity.name === null || identity.email === null;
}

export function removeProfile(
  profiles: readonly Profile[],
  repoProfiles: Readonly<Record<string, string>>,
  activeProfileId: string | null,
  id: string,
): { profiles: Profile[]; repoProfiles: Record<string, string>; activeProfileId: string | null } {
  return {
    profiles: profiles.filter((profile) => profile.id !== id),
    repoProfiles: Object.fromEntries(Object.entries(repoProfiles).filter(([, profileId]) => profileId !== id)),
    activeProfileId: activeProfileId === id ? null : activeProfileId,
  };
}
