import { call } from "@/shared/lib/tauri-client";
import type { Visibility } from "./secrets-model";

export interface SecretsScope {
  accountId: string;
  owner: string;
  repo: string;
  org: string | null;
}

export interface ActionsSecret {
  name: string;
  createdAt: string;
  updatedAt: string;
  visibility: string | null;
}

export interface ActionsVariable {
  name: string;
  value: string;
  createdAt: string;
  updatedAt: string;
  visibility: string | null;
}

export function listSecrets(scope: SecretsScope): Promise<ActionsSecret[]> {
  return call<ActionsSecret[]>("github_actions_secrets_list", { ...scope });
}

export function listVariables(scope: SecretsScope): Promise<ActionsVariable[]> {
  return call<ActionsVariable[]>("github_actions_variables_list", { ...scope });
}

export function putSecret(scope: SecretsScope, name: string, value: string, visibility: Visibility | null): Promise<void> {
  return call<void>("github_actions_secret_put", { ...scope, name, value, visibility });
}

export function deleteSecret(scope: SecretsScope, name: string): Promise<void> {
  return call<void>("github_actions_secret_delete", { ...scope, name });
}

export function createVariable(scope: SecretsScope, name: string, value: string, visibility: Visibility | null): Promise<void> {
  return call<void>("github_actions_variable_create", { ...scope, name, value, visibility });
}

export function updateVariable(scope: SecretsScope, name: string, value: string): Promise<void> {
  return call<void>("github_actions_variable_update", { ...scope, name, value });
}

export function deleteVariable(scope: SecretsScope, name: string): Promise<void> {
  return call<void>("github_actions_variable_delete", { ...scope, name });
}
