import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useCancellableJob } from "@/shared/hooks/use-cancellable-job";
import { folderNameFromUrl } from "@/shared/lib/paths";
import { describeProgress } from "@/shared/lib/progress";
import type { Progress, Submodule } from "@/shared/types/git";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { Dialog } from "@/shared/ui/dialog";
import { ProgressBar } from "@/shared/ui/progress-bar";
import { TextField } from "@/shared/ui/text-field";
import { removeExistingSubmodule, runRepoJob } from "../actions";
import { addSubmodule, updateSubmodules } from "../api";
import { useSubmoduleDialogStore } from "../dialog-store";

interface DialogProps {
  repoPath: string;
  onClose: () => void;
}

function ProgressBlock({ progress, label }: { progress: Progress | null; label: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-1.5" role="status">
      <ProgressBar percent={progress ? progress.percent : null} label={label} />
      <p className="text-xs text-muted">{progress ? describeProgress(progress) : t("submodules.working")}</p>
    </div>
  );
}

function AddSubmoduleDialog({ repoPath, onClose }: DialogProps) {
  const { t } = useTranslation();
  const { run, cancel, running, progress } = useCancellableJob();
  const [url, setUrl] = useState("");
  const [pathOverride, setPathOverride] = useState<string | null>(null);
  const [branch, setBranch] = useState("");
  const submodulePath = pathOverride ?? folderNameFromUrl(url);
  const canSubmit = url.trim() !== "" && submodulePath.trim() !== "" && !running;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    const succeeded = await runRepoJob(
      repoPath,
      () => run((jobId, onProgress) => addSubmodule(repoPath, url.trim(), submodulePath.trim(), branch.trim() || null, jobId, onProgress)),
      "submodules.added",
    );
    if (succeeded) {
      onClose();
    }
  }

  return (
    <Dialog
      open
      title={t("submodules.addDialog.title")}
      description={t("submodules.addDialog.description")}
      onClose={onClose}
      dismissible={!running}
      footer={
        running ? (
          <Button onClick={cancel}>{t("common.cancel")}</Button>
        ) : (
          <>
            <Button onClick={onClose}>{t("common.cancel")}</Button>
            <Button variant="primary" type="submit" form="add-submodule-form" disabled={!canSubmit}>
              {t("submodules.addDialog.submit")}
            </Button>
          </>
        )
      }
    >
      <form id="add-submodule-form" onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
        <TextField
          data-autofocus
          label={t("submodules.addDialog.url")}
          placeholder="https://github.com/usuario/libreria.git"
          value={url}
          disabled={running}
          onChange={(event) => setUrl(event.target.value)}
          spellCheck={false}
        />
        <TextField
          label={t("submodules.addDialog.path")}
          value={submodulePath}
          disabled={running}
          onChange={(event) => setPathOverride(event.target.value)}
          hint={t("submodules.addDialog.pathHint")}
          spellCheck={false}
        />
        <TextField
          label={t("submodules.addDialog.branch")}
          value={branch}
          disabled={running}
          onChange={(event) => setBranch(event.target.value)}
          placeholder={t("submodules.addDialog.branchPlaceholder")}
          spellCheck={false}
        />
        {running ? <ProgressBlock progress={progress} label={t("submodules.addDialog.progress")} /> : null}
      </form>
    </Dialog>
  );
}

function UpdateSubmoduleDialog({ repoPath, submodule, onClose }: DialogProps & { submodule: Submodule | null }) {
  const { t } = useTranslation();
  const { run, cancel, running, progress } = useCancellableJob();
  const [init, setInit] = useState(true);
  const [recursive, setRecursive] = useState(true);
  const [remote, setRemote] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (running) {
      return;
    }
    const succeeded = await runRepoJob(
      repoPath,
      () =>
        run((jobId, onProgress) =>
          updateSubmodules(repoPath, { submodulePath: submodule?.path ?? null, init, recursive, remote }, jobId, onProgress),
        ),
      "submodules.updated",
    );
    if (succeeded) {
      onClose();
    }
  }

  const options = [
    { id: "init", label: t("submodules.updateDialog.init"), checked: init, set: setInit },
    { id: "recursive", label: t("submodules.updateDialog.recursive"), checked: recursive, set: setRecursive },
    { id: "remote", label: t("submodules.updateDialog.remote"), checked: remote, set: setRemote },
  ];

  return (
    <Dialog
      open
      title={t("submodules.updateDialog.title")}
      description={submodule ? t("submodules.updateDialog.single", { path: submodule.path }) : t("submodules.updateDialog.all")}
      onClose={onClose}
      width="sm"
      dismissible={!running}
      footer={
        running ? (
          <Button onClick={cancel}>{t("common.cancel")}</Button>
        ) : (
          <>
            <Button onClick={onClose}>{t("common.cancel")}</Button>
            <Button variant="primary" type="submit" form="update-submodule-form" data-autofocus>
              {t("submodules.updateDialog.submit")}
            </Button>
          </>
        )
      }
    >
      <form id="update-submodule-form" onSubmit={(event) => void submit(event)} className="flex flex-col gap-3">
        {options.map((option) => (
          <label key={option.id} className="flex cursor-pointer items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={option.checked}
              disabled={running}
              onChange={(event) => option.set(event.target.checked)}
              className="size-3.5 cursor-pointer accent-accent"
            />
            {option.label}
          </label>
        ))}
        {running ? <ProgressBlock progress={progress} label={t("submodules.updateDialog.progress")} /> : null}
      </form>
    </Dialog>
  );
}

function RemoveSubmoduleDialog({ repoPath, submodule, onClose }: DialogProps & { submodule: Submodule }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    const succeeded = await removeExistingSubmodule(repoPath, submodule.path);
    setBusy(false);
    if (succeeded) {
      onClose();
    }
  }

  return (
    <ConfirmDialog
      open
      title={t("submodules.removeDialog.title", { path: submodule.path })}
      description={t("submodules.removeDialog.description")}
      consequences={[
        t("submodules.removeDialog.loseFolder", { path: submodule.path }),
        t("submodules.removeDialog.loseChanges"),
        t("submodules.removeDialog.stagedRemoval"),
      ]}
      confirmLabel={t("submodules.removeDialog.confirm")}
      destructive
      loading={busy}
      onConfirm={() => void confirm()}
      onCancel={onClose}
    />
  );
}

export function SubmoduleDialogs({ repoPath }: { repoPath: string }) {
  const dialog = useSubmoduleDialogStore((state) => state.dialog);
  const hide = useSubmoduleDialogStore((state) => state.hide);
  if (!dialog) {
    return null;
  }
  switch (dialog.kind) {
    case "add":
      return <AddSubmoduleDialog repoPath={repoPath} onClose={hide} />;
    case "update":
      return <UpdateSubmoduleDialog repoPath={repoPath} submodule={dialog.submodule} onClose={hide} />;
    case "remove":
      return <RemoveSubmoduleDialog repoPath={repoPath} submodule={dialog.submodule} onClose={hide} />;
  }
}
