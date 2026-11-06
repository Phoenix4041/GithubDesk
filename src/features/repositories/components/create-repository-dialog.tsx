import { FolderOpen } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { pickDirectory } from "@/shared/lib/dialogs";
import { joinPath } from "@/shared/lib/paths";
import { reportError } from "@/shared/lib/report-error";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { TextField } from "@/shared/ui/text-field";
import { initRepository } from "../api";
import { useRepositoriesStore } from "../store";

interface CreateRepositoryDialogProps {
  open: boolean;
  onClose: () => void;
}

export function CreateRepositoryDialog({ open, onClose }: CreateRepositoryDialogProps) {
  const { t } = useTranslation();
  const lastParentDirectory = useRepositoriesStore((state) => state.lastParentDirectory);
  const rememberParentDirectory = useRepositoriesStore((state) => state.rememberParentDirectory);
  const activate = useRepositoriesStore((state) => state.activate);

  const [name, setName] = useState("");
  const [initialBranch, setInitialBranch] = useState("main");
  const [parentDirectory, setParentDirectory] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const effectiveParent = parentDirectory ?? lastParentDirectory ?? "";
  const canSubmit = name.trim().length > 0 && effectiveParent.length > 0 && initialBranch.trim().length > 0;

  async function chooseDirectory() {
    const selected = await pickDirectory(t("repositories.create.chooseFolder"));
    if (selected) {
      setParentDirectory(selected);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit || creating) {
      return;
    }
    setCreating(true);
    try {
      const info = await initRepository(effectiveParent, name.trim(), initialBranch.trim());
      rememberParentDirectory(effectiveParent);
      activate(info);
      setName("");
      onClose();
    } catch (error) {
      reportError(error);
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog
      open={open}
      title={t("repositories.create.title")}
      description={t("repositories.create.description")}
      onClose={onClose}
      dismissible={!creating}
      footer={
        <>
          <Button onClick={onClose} disabled={creating}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" type="submit" form="create-repository-form" disabled={!canSubmit} loading={creating}>
            {t("repositories.create.submit")}
          </Button>
        </>
      }
    >
      <form id="create-repository-form" onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-4">
        <TextField
          data-autofocus
          label={t("repositories.create.name")}
          placeholder="mi-proyecto"
          value={name}
          onChange={(event) => setName(event.target.value)}
          spellCheck={false}
        />
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <TextField
              label={t("repositories.create.location")}
              value={effectiveParent}
              readOnly
              placeholder={t("repositories.create.locationPlaceholder")}
              title={effectiveParent}
              hint={
                effectiveParent && name.trim()
                  ? t("repositories.create.destination", { path: joinPath(effectiveParent, name.trim()) })
                  : undefined
              }
            />
          </div>
          <Button icon={<FolderOpen className="size-4" />} onClick={() => void chooseDirectory()}>
            {t("repositories.create.chooseFolder")}
          </Button>
        </div>
        <TextField
          label={t("repositories.create.initialBranch")}
          value={initialBranch}
          onChange={(event) => setInitialBranch(event.target.value)}
          spellCheck={false}
        />
      </form>
    </Dialog>
  );
}
