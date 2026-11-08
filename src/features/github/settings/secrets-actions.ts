import { i18next } from "@/i18n";
import { queryClient } from "@/shared/lib/query-client";
import { reportError } from "@/shared/lib/report-error";
import { showToast } from "@/shared/ui/toast-store";
import { createVariable, deleteSecret, deleteVariable, putSecret, updateVariable } from "./secrets-api";
import type { SecretsScope } from "./secrets-api";
import { secretsRoot } from "./secrets-queries";
import type { Visibility } from "./secrets-model";

async function run(work: () => Promise<unknown>, message: () => string): Promise<boolean> {
  try {
    await work();
    await queryClient.invalidateQueries({ queryKey: secretsRoot });
    showToast({ kind: "success", title: message() });
    return true;
  } catch (error) {
    reportError(error);
    return false;
  }
}

export function saveSecret(scope: SecretsScope, name: string, value: string, visibility: Visibility | null): Promise<boolean> {
  return run(
    () => putSecret(scope, name, value, visibility),
    () => i18next.t("github.settings.secrets.secretSaved", { name }),
  );
}

export function removeSecret(scope: SecretsScope, name: string): Promise<boolean> {
  return run(
    () => deleteSecret(scope, name),
    () => i18next.t("github.settings.secrets.secretDeleted", { name }),
  );
}

export function addVariable(scope: SecretsScope, name: string, value: string, visibility: Visibility | null): Promise<boolean> {
  return run(
    () => createVariable(scope, name, value, visibility),
    () => i18next.t("github.settings.secrets.variableSaved", { name }),
  );
}

export function changeVariable(scope: SecretsScope, name: string, value: string): Promise<boolean> {
  return run(
    () => updateVariable(scope, name, value),
    () => i18next.t("github.settings.secrets.variableSaved", { name }),
  );
}

export function removeVariable(scope: SecretsScope, name: string): Promise<boolean> {
  return run(
    () => deleteVariable(scope, name),
    () => i18next.t("github.settings.secrets.variableDeleted", { name }),
  );
}
