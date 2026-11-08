import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useRepositoryDialogStore } from "@/features/repositories/dialog-store";
import { useSettingsStore } from "@/features/settings/store";
import { queryClient } from "@/shared/lib/query-client";
import { reportError } from "@/shared/lib/report-error";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { Dialog } from "@/shared/ui/dialog";
import { SelectField, TextField } from "@/shared/ui/text-field";
import { showToast } from "@/shared/ui/toast-store";
import { i18next } from "@/i18n";
import { createRepository } from "../../orgs/api";
import { useOrgs } from "../../orgs/queries";
import { useAccounts } from "../../queries";
import { homeContext, validRepositoryName } from "../home-model";
import { homeKeys } from "../queries";
import { useGithubHomeDialogStore } from "../store";

function CreateForm({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const accounts = useAccounts();
  const profiles = useSettingsStore((state) => state.profiles);
  const activeProfileId = useSettingsStore((state) => state.activeProfileId);
  const showClone = useRepositoryDialogStore((state) => state.show);
  const context = homeContext(profiles, activeProfileId, accounts.data ?? []);
  const account = context.account;
  const orgs = useOrgs(account?.id ?? null);
  const [owner, setOwner] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPrivate, setIsPrivate] = useState(true);
  const [autoInit, setAutoInit] = useState(true);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  const org = owner !== null ? (owner === "" ? null : owner) : context.org;
  const nameValid = validRepositoryName(name);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!account || !nameValid || busy) {
      return;
    }
    setBusy(true);
    try {
      const created = await createRepository(account.id, org, {
        name: name.trim(),
        description: description.trim(),
        private: isPrivate,
        autoInit,
        gitignoreTemplate: null,
        licenseTemplate: null,
      });
      await queryClient.invalidateQueries({ queryKey: homeKeys.all });
      showToast({ kind: "success", title: i18next.t("github.home.created", { name: created.fullName }) });
      onClose();
      if (autoInit) {
        showClone("clone", { url: created.cloneUrl, accountId: account.id });
      }
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      title={t("github.home.createDialog.title")}
      description={t("github.home.createDialog.description", { login: account?.login ?? "" })}
      onClose={onClose}
      dismissible={!busy}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" type="submit" form="create-github-repo-form" disabled={!account} loading={busy}>
            {t("github.home.createDialog.submit")}
          </Button>
        </>
      }
    >
      <form id="create-github-repo-form" onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
        <SelectField
          label={t("github.home.createDialog.owner")}
          value={org ?? ""}
          onChange={(event) => setOwner(event.target.value === "" ? "" : event.target.value)}
        >
          <option value="">{account?.login ?? ""}</option>
          {(orgs.data ?? []).map((item) => (
            <option key={item.login} value={item.login}>
              {item.login}
            </option>
          ))}
        </SelectField>
        <TextField
          data-autofocus
          label={t("github.home.createDialog.name")}
          value={name}
          error={touched && !nameValid ? t("github.home.createDialog.nameInvalid") : undefined}
          onChange={(event) => setName(event.target.value)}
          spellCheck={false}
        />
        <TextField
          label={t("github.home.createDialog.descriptionLabel")}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
        <div className="flex flex-col gap-2">
          <label className="flex cursor-pointer items-center gap-2 text-[13px]">
            <Checkbox label={t("github.home.createDialog.private")} checked={isPrivate} onChange={(event) => setIsPrivate(event.target.checked)} />
            {t("github.home.createDialog.private")}
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-[13px]">
            <Checkbox label={t("github.home.createDialog.readme")} checked={autoInit} onChange={(event) => setAutoInit(event.target.checked)} />
            {t("github.home.createDialog.readme")}
          </label>
          <p className="text-xs text-muted">{t("github.home.createDialog.readmeHint")}</p>
        </div>
      </form>
    </Dialog>
  );
}

export function CreateGithubRepoDialog() {
  const open = useGithubHomeDialogStore((state) => state.createOpen);
  const hide = useGithubHomeDialogStore((state) => state.hideCreate);
  if (!open) {
    return null;
  }
  return <CreateForm onClose={hide} />;
}
