import { FolderOpen } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useCancellableJob } from "@/shared/hooks/use-cancellable-job";
import { pickDirectory } from "@/shared/lib/dialogs";
import { folderNameFromUrl, joinPath } from "@/shared/lib/paths";
import { describeProgress } from "@/shared/lib/progress";
import { reportError } from "@/shared/lib/report-error";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { ProgressBar } from "@/shared/ui/progress-bar";
import { TextField } from "@/shared/ui/text-field";
import { cloneRepository } from "../api";
import { useRepositoriesStore } from "../store";

interface CloneRepositoryDialogProps {
  open: boolean;
  onClose: () => void;
}

export function CloneRepositoryDialog({ open, onClose }: CloneRepositoryDialogProps) {
  const { t } = useTranslation();
  const lastParentDirectory = useRepositoriesStore((state) => state.lastParentDirectory);
  const rememberParentDirectory = useRepositoriesStore((state) => state.rememberParentDirectory);
  const activate = useRepositoriesStore((state) => state.activate);
  const { run, cancel, running, progress } = useCancellableJob();

  const [url, setUrl] = useState("");
  const [parentDirectory, setParentDirectory] = useState<string | null>(null);
  const [nameOverride, setNameOverride] = useState<string | null>(null);

  const effectiveParent = parentDirectory ?? lastParentDirectory ?? "";
  const folderName = nameOverride ?? folderNameFromUrl(url);
  const destination = effectiveParent && folderName ? joinPath(effectiveParent, folderName) : "";
  const canSubmit = url.trim().length > 0 && destination.length > 0;

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
      const info = await run((jobId, onProgress) => cloneRepository(url.trim(), destination, jobId, onProgress));
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
