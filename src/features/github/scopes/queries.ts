import { useQuery } from "@tanstack/react-query";
import { call } from "@/shared/lib/tauri-client";
import type { TokenInfo } from "@/shared/types/git";

export const tokenInfoKeys = {
  all: ["github", "token-info"] as const,
  account: (accountId: string) => ["github", "token-info", accountId] as const,
};

export function getTokenInfo(accountId: string): Promise<TokenInfo> {
  return call<TokenInfo>("github_token_info", { accountId });
}

export function useTokenInfo(accountId: string | null) {
  return useQuery({
    queryKey: tokenInfoKeys.account(accountId ?? ""),
    queryFn: () => getTokenInfo(accountId ?? ""),
    enabled: accountId !== null,
    staleTime: 30_000,
    retry: false,
  });
}
