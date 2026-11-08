import { useQuery } from "@tanstack/react-query";
import { getLoginOptions, listAccounts } from "./api";

export const accountKeys = {
  all: ["github", "accounts"] as const,
  loginOptions: ["github", "login-options"] as const,
};

export function useAccounts() {
  return useQuery({
    queryKey: accountKeys.all,
    queryFn: listAccounts,
    staleTime: 60_000,
  });
}

export function useLoginOptions(enabled: boolean) {
  return useQuery({
    queryKey: accountKeys.loginOptions,
    queryFn: getLoginOptions,
    enabled,
    staleTime: 30_000,
    retry: false,
  });
}
