import { FolderOpen } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useBranches } from "@/features/branches/queries";
import { pickDirectory } from "@/shared/lib/dialogs";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { TextField } from "@/shared/ui/text-field";
import type { Worktree } from "@/shared/types/git";
import { createWorktree, lockExistingWorktree, removeExistingWorktree } from "../actions";
import { useWorktreeDialogStore } from "../dialog-store";
import { useWorktrees } from "../queries";
import {
  branchesWithoutWorktree,
  defaultWorktreeName,
  joinFolder,
  parentFolderOf,
} from "../worktree-model";

type Mode = "existing" | "new" | "detached";

interface DialogProps {
  repoPath: string;
  onClose: () => void;
}

function CreateWorktreeDialog({ repoPath, onClose, branch }: DialogProps & { branch?: string }) {
  const { t } = useTranslation();
  const branches = useBranches(repoPath);
  const worktrees = useWorktrees(repoPath);
  const available = branchesWithoutWorktree(branches.data ?? [], worktrees.data ?? []);
  const [chosenMode, setChosenMode] = useState<Mode | null>(null);
  const mode: Mode = chosenMode ?? (branch === undefined && available.length === 0 ? "new" : "existing");
  const [chosen, setChosen] = useState<string | null>(branch ?? null);
  const [newBranch, setNewBranch] = useState("");
  const [startPoint, setStartPoint] = useState("");
  const [detachedRevision, setDetachedRevision] = useState("HEAD");
  const [parent, setParent] = useState<string | null>(null);
  const [nameOverride, setNameOverride] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const existingBranch = chosen ?? available[0]?.name ?? "";
  const targetLabel = mode === "existing" ? existingBranch : mode === "new" ? newBranch.trim() : "detached";
  const effectiveParent = parent ?? parentFolderOf(repoPath);
  const folderName = nameOverride ?? (targetLabel === "" ? "" : defaultWorktreeName(repoPath, targetLabel));
  const destination = folderName === "" ? "" : joinFolder(effectiveParent, folderName);
  const hasTarget = mode === "existing" ? existingBranch !== "" : mode === "new" ? newBranch.trim() !== "" : true;
  const canSubmit = hasTarget && destination !== "" && !busy;

  async function chooseParent() {
    const selected = await pickDirectory(t("worktrees.createDialog.chooseFolder"));
    if (selected) {
      setParent(selected);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    setBusy(true);
    const succeeded = await createWorktree(repoPath, {
      path: destination,
      branch: mode === "existing" ? existingBranch : null,
      newBranch: mode === "new" ? newBranch.trim() : null,
      startPoint: mode === "new" ? startPoint.trim() || null : mode === "detached" ? detachedRevision.trim() || null : null,
      detach: mode === "detached",
    });
    setBusy(false);
    if (succeeded) {
      onClose();
    }
  }

  const modes: Array<{ id: Mode; label: string }> = [
    { id: "existing", label: t("worktrees.createDialog.modes.existing") },
    { id: "new", label: t("worktrees.createDialog.modes.new") },
    { id: "detached", label: t("worktrees.createDialog.modes.detached") },
  ];

  return (
    <Dialog
      open
      title={t("worktrees.createDialog.title")}
      description={t("worktrees.createDialog.description")}
      onClose={onClose}
      dismissible={!busy}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" type="submit" form="create-worktree-form" disabled={!canSubmit} loading={busy}>
            {t("worktrees.createDialog.submit")}
          </Button>
        </>
      }
    >
      <form id="create-worktree-form" onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
        <div role="radiogroup" aria-label={t("worktrees.createDialog.modeLabel")} className="inline-flex w-fit gap-1 rounded-lg bg-subtle p-1">
          {modes.map((item) => (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={mode === item.id}
              onClick={() => setChosenMode(item.id)}
              className={cn(
                "h-7 cursor-pointer rounded-md px-3 text-xs font-medium transition-colors duration-150",
                mode === item.id ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        {mode === "existing" ? (
          available.length === 0 ? (
            <p className="text-xs text-muted">{t("worktrees.createDialog.noBranches")}</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="worktree-branch" className="text-xs font-medium">
                {t("worktrees.createDialog.branch")}
              </label>
              <select
                id="worktree-branch"
                value={existingBranch}
                onChange={(event) => {
                  setChosen(event.target.value);
                  setNameOverride(null);
                }}
                className="h-8 cursor-pointer rounded-md border border-line bg-surface px-2 text-[13px] text-fg focus-visible:border-accent focus-visible:outline-none"
              >
                {available.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
          )
        ) : null}

        {mode === "new" ? (
          <>
            <TextField
              data-autofocus
              label={t("worktrees.createDialog.newBranch")}
              placeholder="feature/mi-cambio"
              value={newBranch}
              onChange={(event) => {
                setNewBranch(event.target.value);
                setNameOverride(null);
              }}
              spellCheck={false}
            />
            <TextField
              label={t("worktrees.createDialog.startPoint")}
              placeholder="HEAD"
              value={startPoint}
              onChange={(event) => setStartPoint(event.target.value)}
              spellCheck={false}
            />
          </>
        ) : null}

        {mode === "detached" ? (
          <TextField
            label={t("worktrees.createDialog.revision")}
            value={detachedRevision}
            onChange={(event) => setDetachedRevision(event.target.value)}
            hint={t("worktrees.createDialog.revisionHint")}
            spellCheck={false}
          />
        ) : null}

        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <TextField label={t("worktrees.createDialog.location")} value={effectiveParent} readOnly title={effectiveParent} />
          </div>
          <Button icon={<FolderOpen className="size-4" />} onClick={() => void chooseParent()}>
            {t("worktrees.createDialog.chooseFolder")}
          </Button>
        </div>
        <TextField
          label={t("worktrees.createDialog.folderName")}
          value={folderName}
          onChange={(event) => setNameOverride(event.target.value)}
          hint={destination ? t("worktrees.createDialog.destination", { path: destination }) : undefined}
          spellCheck={false}
        />
      </form>
    </Dialog>
  );
}

function RemoveWorktreeDialog({ repoPath, worktree, onClose }: DialogProps & { worktree: Worktree }) {
  const { t } = useTranslation();
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    const succeeded = await removeExistingWorktree(repoPath, worktree.path, force);
    setBusy(false);
    if (succeeded) {
      onClose();
    }
  }

  return (
    <Dialog
      open
      title={t("worktrees.removeDialog.title")}
      onClose={onClose}
      width="sm"
      dismissible={!busy}
      footer={
        <>
          <Button onClick={onClose} disabled={busy} data-autofocus>
            {t("common.cancel")}
          </Button>
          <Button variant="danger" onClick={() => void confirm()} loading={busy}>
            {t("worktrees.removeDialog.confirm")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-[13px]">
        <p className="text-muted">{t("worktrees.removeDialog.description", { path: worktree.path })}</p>
        <p className="text-muted">{t("worktrees.removeDialog.branchKept")}</p>
        <label className="flex cursor-pointer items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={force}
            onChange={(event) => setForce(event.target.checked)}
            className="size-3.5 cursor-pointer accent-accent"
          />
          {t("worktrees.removeDialog.force")}
        </label>
      </div>
    </Dialog>
  );
}

function LockWorktreeDialog({ repoPath, worktree, onClose }: DialogProps & { worktree: Worktree }) {
  const { t } = useTranslation();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const succeeded = await lockExistingWorktree(repoPath, worktree.path, reason);
    setBusy(false);
    if (succeeded) {
      onClose();
    }
  }

  return (
    <Dialog
      open
      title={t("worktrees.lockDialog.title")}
      description={t("worktrees.lockDialog.description")}
      onClose={onClose}
      width="sm"
      dismissible={!busy}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" type="submit" form="lock-worktree-form" loading={busy}>
            {t("worktrees.lockDialog.submit")}
          </Button>
        </>
      }
    >
      <form id="lock-worktree-form" onSubmit={(event) => void submit(event)}>
        <TextField
          data-autofocus
          label={t("worktrees.lockDialog.reason")}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </form>
    </Dialog>
  );
}

export function WorktreeDialogs({ repoPath }: { repoPath: string }) {
  const dialog = useWorktreeDialogStore((state) => state.dialog);
  const hide = useWorktreeDialogStore((state) => state.hide);
  if (!dialog) {
    return null;
  }
  switch (dialog.kind) {
    case "create":
      return <CreateWorktreeDialog repoPath={repoPath} onClose={hide} branch={dialog.branch} />;
    case "remove":
      return <RemoveWorktreeDialog repoPath={repoPath} worktree={dialog.worktree} onClose={hide} />;
    case "lock":
      return <LockWorktreeDialog repoPath={repoPath} worktree={dialog.worktree} onClose={hide} />;
  }
}
