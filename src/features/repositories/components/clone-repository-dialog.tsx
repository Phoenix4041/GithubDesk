import { FolderOpen } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { homeContext, pickCloneAccount } from "@/features/github/home/home-model";
import { useAccounts } from "@/features/github/queries";
import { useSettingsStore } from "@/features/settings/store";
import { useCancellableJob } from "@/shared/hooks/use-cancellable-job";
import { pickDirectory } from "@/shared/lib/dialogs";
import { folderNameFromUrl, joinPath } from "@/shared/lib/paths";
import { describeProgress } from "@/shared/lib/progress";
import { reportError } from "@/shared/lib/report-error";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { Dialog } from "@/shared/ui/dialog";
import { ProgressBar } from "@/shared/ui/progress-bar";
import { TextField } from "@/shared/ui/text-field";
import { cloneRepository } from "../api";
import type { ClonePreset } from "../dialog-store";
import { useRepositoriesStore } from "../store";

interface CloneRepositoryDialogProps {
  open: boolean;
  preset: ClonePreset | null;
  onClose: () => void;
}

export function CloneRepositoryDialog({ open, preset, onClose }: CloneRepositoryDialogProps) {
  const { t } = useTranslation();
  const lastParentDirectory = useRepositoriesStore((state) => state.lastParentDirectory);
  const rememberParentDirectory = useRepositoriesStore((state) => state.rememberParentDirectory);
  const activate = useRepositoriesStore((state) => state.activate);
  const { run, cancel, running, progress } = useCancellableJob();

  const accounts = useAccounts();
  const profiles = useSettingsStore((state) => state.profiles);
  const activeProfileId = useSettingsStore((state) => state.activeProfileId);
  const [url, setUrl] = useState(preset?.url ?? "");
  const [parentDirectory, setParentDirectory] = useState<string | null>(null);
  const [nameOverride, setNameOverride] = useState<string | null>(null);
  const [shallow, setShallow] = useState(false);
  const [depthText, setDepthText] = useState("1");
  const [blobless, setBlobless] = useState(false);
  const depth = Number.parseInt(depthText, 10);
  const depthValid = !shallow || (/^\d+$/.test(depthText.trim()) && depth >= 1);

  const effectiveParent = parentDirectory ?? lastParentDirectory ?? "";
  const folderName = nameOverride ?? folderNameFromUrl(url);
  const destination = effectiveParent && folderName ? joinPath(effectiveParent, folderName) : "";
  const canSubmit = url.trim().length > 0 && destination.length > 0 && depthValid;
  const accountList = accounts.data ?? [];
  const activeAccountId = homeContext(profiles, activeProfileId, accountList).account?.id ?? null;
  const presetAccount = preset?.accountId ? accountList.find((item) => item.id === preset.accountId) : undefined;
  const cloneAccount = presetAccount ?? pickCloneAccount(url, accountList, activeAccountId);

  async function chooseDirectory() {
    const selected = await pickDirectory(t("repositories.clone.chooseFolder"));
    if (selected) {
      setParentDirectory(selected);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit || running) {
      return;
    }
    try {
      const info = await run((jobId, onProgress) =>
        cloneRepository(url.trim(), destination, jobId, cloneAccount?.id ?? null, onProgress, {
          depth: shallow ? depth : null,
          blobless,
        }),
      );
      rememberParentDirectory(effectiveParent);
      activate(info);
      setUrl("");
      setNameOverride(null);
      onClose();
    } catch (error) {
      reportError(error);
    }
  }

  return (
    <Dialog
      open={open}
      title={t("repositories.clone.title")}
      description={t("repositories.clone.description")}
      onClose={onClose}
      dismissible={!running}
      footer={
        running ? (
          <Button onClick={cancel}>{t("common.cancel")}</Button>
        ) : (
          <>
            <Button onClick={onClose}>{t("common.cancel")}</Button>
            <Button variant="primary" type="submit" form="clone-repository-form" disabled={!canSubmit}>
              {t("repositories.clone.submit")}
            </Button>
          </>
        )
      }
    >
      <form id="clone-repository-form" onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-4">
        <TextField
          data-autofocus
          label={t("repositories.clone.url")}
          placeholder="https://github.com/usuario/proyecto.git"
          value={url}
          disabled={running}
          onChange={(event) => setUrl(event.target.value)}
          spellCheck={false}
        />
        {cloneAccount ? (
          <p className="text-xs text-muted">{t("repositories.clone.usingAccount", { login: cloneAccount.login })}</p>
        ) : null}
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <TextField
              label={t("repositories.clone.location")}
              value={effectiveParent}
              readOnly
              placeholder={t("repositories.clone.locationPlaceholder")}
              title={effectiveParent}
            />
          </div>
          <Button icon={<FolderOpen className="size-4" />} onClick={() => void chooseDirectory()} disabled={running}>
            {t("repositories.clone.chooseFolder")}
          </Button>
        </div>
        <TextField
          label={t("repositories.clone.folderName")}
          value={folderName}
          disabled={running}
          onChange={(event) => setNameOverride(event.target.value)}
          hint={destination ? t("repositories.clone.destination", { path: destination }) : undefined}
          spellCheck={false}
        />
        <fieldset className="flex flex-col gap-2" disabled={running}>
          <legend className="mb-1 text-xs font-medium text-muted">{t("repositories.clone.advanced")}</legend>
          <label className="flex items-center gap-2 text-[13px]">
            <Checkbox label={t("repositories.clone.shallow")} checked={shallow} onChange={(event) => setShallow(event.target.checked)} />
            <span>{t("repositories.clone.shallow")}</span>
          </label>
          {shallow ? (
            <TextField
              label={t("repositories.clone.depth")}
              value={depthText}
              inputMode="numeric"
              onChange={(event) => setDepthText(event.target.value)}
              error={depthValid ? undefined : t("repositories.clone.depthInvalid")}
              hint={t("repositories.clone.depthHint")}
              className="w-28"
            />
          ) : null}
          <label className="flex items-center gap-2 text-[13px]">
            <Checkbox label={t("repositories.clone.blobless")} checked={blobless} onChange={(event) => setBlobless(event.target.checked)} />
            <span>{t("repositories.clone.blobless")}</span>
          </label>
          {blobless ? <p className="text-xs text-muted">{t("repositories.clone.bloblessHint")}</p> : null}
        </fieldset>
        {running ? (
          <div className="flex flex-col gap-1.5" role="status">
            <ProgressBar percent={progress ? progress.percent : null} label={t("repositories.clone.progress")} />
            <p className="text-xs text-muted">
              {progress ? describeProgress(progress) : t("repositories.clone.connecting")}
            </p>
          </div>
        ) : null}
      </form>
    </Dialog>
  );
}
