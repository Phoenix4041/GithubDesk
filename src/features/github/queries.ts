import { useQuery } from "@tanstack/react-query";
import { listAccounts } from "./api";

export const accountKeys = {
  all: ["github", "accounts"] as const,
};

export function useAccounts() {
  return useQuery({
    queryKey: accountKeys.all,
    queryFn: listAccounts,
    staleTime: 60_000,
  });
}
