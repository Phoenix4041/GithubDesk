import { useQuery } from "@tanstack/react-query";
import { listSecrets, listVariables } from "./secrets-api";
import type { SecretsScope } from "./secrets-api";

export function secretsKey(scope: SecretsScope, kind: "secrets" | "variables") {
  return ["github", "actions-secrets", scope.accountId, scope.org ?? `${scope.owner}/${scope.repo}`, kind] as const;
}

export const secretsRoot = ["github", "actions-secrets"] as const;

export function useSecrets(scope: SecretsScope) {
  return useQuery({
    queryKey: secretsKey(scope, "secrets"),
    queryFn: () => listSecrets(scope),
    staleTime: 30_000,
    retry: false,
  });
}

export function useVariables(scope: SecretsScope) {
  return useQuery({
    queryKey: secretsKey(scope, "variables"),
    queryFn: () => listVariables(scope),
    staleTime: 30_000,
    retry: false,
  });
}
