import { useQuery } from "@tanstack/react-query";
import { listOrgs } from "./api";

export const orgKeys = {
  all: ["github", "orgs"] as const,
  account: (accountId: string) => ["github", "orgs", accountId] as const,
};

export function useOrgs(accountId: string | null) {
  return useQuery({
    queryKey: orgKeys.account(accountId ?? ""),
    queryFn: () => listOrgs(accountId ?? ""),
    enabled: accountId !== null,
    staleTime: 5 * 60_000,
    retry: false,
  });
}
