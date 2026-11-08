import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useRepositoriesStore } from "@/features/repositories/store";
import { useSettingsStore } from "@/features/settings/store";
import { useCancellableJob } from "@/shared/hooks/use-cancellable-job";
import { splitPath } from "@/shared/lib/paths";
import { describeProgress } from "@/shared/lib/progress";
import { refreshRepository, repoKeys, queryClient } from "@/shared/lib/query-client";
import { reportError } from "@/shared/lib/report-error";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { Dialog } from "@/shared/ui/dialog";
import { ProgressBar } from "@/shared/ui/progress-bar";
import { SelectField, TextField } from "@/shared/ui/text-field";
import { showToast } from "@/shared/ui/toast-store";
import { i18next } from "@/i18n";
import { useOrgs } from "../../orgs/queries";
import { useAccounts } from "../../queries";
import { homeContext, suggestedRepositoryName, validRepositoryName } from "../home-model";
import { publishRepository } from "../api";
import { useGithubHomeDialogStore } from "../store";

function PublishForm({ repoPath, onClose }: { repoPath: string; onClose: () => void }) {
  const { t } = useTranslation();
  const accounts = useAccounts();
  const profiles = useSettingsStore((state) => state.profiles);
  const activeProfileId = useSettingsStore((state) => state.activeProfileId);
  const recents = useRepositoriesStore((state) => state.recents);
  const { run, cancel, running, progress } = useCancellableJob();
  const context = homeContext(profiles, activeProfileId, accounts.data ?? []);
  const folder = recents.find((recent) => recent.path === repoPath)?.name ?? splitPath(repoPath).fileName;

  const [accountId, setAccountId] = useState<string | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const [nameOverride, setNameOverride] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [isPrivate, setIsPrivate] = useState(true);
  const [touched, setTouched] = useState(false);

  const list = accounts.data ?? [];
  const account = list.find((item) => item.id === accountId) ?? context.account;
  const orgs = useOrgs(account?.id ?? null);
  const org = owner !== null ? (owner === "" ? null : owner) : account?.id === context.account?.id ? context.org : null;
  const name = nameOverride ?? suggestedRepositoryName(folder);
  const nameValid = validRepositoryName(name);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!account || !nameValid || running) {
      return;
    }
    try {
      const created = await run((jobId, onProgress) =>
        publishRepository(
          repoPath,
          account.id,
          org,
          { name: name.trim(), description: description.trim(), private: isPrivate, autoInit: false, gitignoreTemplate: null, licenseTemplate: null },
          jobId,
          onProgress,
        ),
      );
      useSettingsStore.getState().setRepoAccount(repoPath, { accountId: account.id, useForGit: true });
      await queryClient.invalidateQueries({ queryKey: repoKeys.githubRemotes(repoPath) });
      await refreshRepository(repoPath);
      showToast({ kind: "success", title: i18next.t("github.home.published", { name: created.fullName }) });
      onClose();
    } catch (error) {
      reportError(error);
      await refreshRepository(repoPath);
    }
  }

  return (
    <Dialog
      open
      title={t("github.home.publishDialog.title")}
      description={t("github.home.publishDialog.description")}
      onClose={onClose}
      dismissible={!running}
      footer={
        running ? (
          <Button onClick={cancel}>{t("common.cancel")}</Button>
        ) : (
          <>
            <Button onClick={onClose}>{t("common.cancel")}</Button>
            <Button variant="primary" type="submit" form="publish-form" disabled={!account}>
              {t("github.home.publishDialog.submit")}
            </Button>
          </>
        )
      }
    >
      <form id="publish-form" onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
        {list.length > 1 ? (
          <SelectField
            label={t("github.home.publishDialog.account")}
            value={account?.id ?? ""}
            disabled={running}
            onChange={(event) => {
              setAccountId(event.target.value);
              setOwner(null);
            }}
          >
            {list.map((item) => (
              <option key={item.id} value={item.id}>
                {item.login} · {item.host}
              </option>
            ))}
          </SelectField>
        ) : null}
        <SelectField
          label={t("github.home.createDialog.owner")}
          value={org ?? ""}
          disabled={running}
          onChange={(event) => setOwner(event.target.value)}
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
          disabled={running}
          error={touched && !nameValid ? t("github.home.createDialog.nameInvalid") : undefined}
          onChange={(event) => setNameOverride(event.target.value)}
          spellCheck={false}
        />
        <TextField
          label={t("github.home.createDialog.descriptionLabel")}
          value={description}
          disabled={running}
          onChange={(event) => setDescription(event.target.value)}
        />
        <label className="flex cursor-pointer items-center gap-2 text-[13px]">
          <Checkbox
            label={t("github.home.createDialog.private")}
            checked={isPrivate}
            disabled={running}
            onChange={(event) => setIsPrivate(event.target.checked)}
          />
          {t("github.home.createDialog.private")}
        </label>
        {running ? (
          <div className="flex flex-col gap-1.5" role="status">
            <ProgressBar percent={progress ? progress.percent : null} label={t("github.home.publishDialog.progress")} />
            <p className="text-xs text-muted">{progress ? describeProgress(progress) : t("github.home.publishDialog.connecting")}</p>
          </div>
        ) : null}
      </form>
    </Dialog>
  );
}

export function PublishDialog({ repoPath }: { repoPath: string }) {
  const open = useGithubHomeDialogStore((state) => state.publishOpen);
  const hide = useGithubHomeDialogStore((state) => state.hidePublish);
  if (!open) {
    return null;
  }
  return <PublishForm repoPath={repoPath} onClose={hide} />;
}
