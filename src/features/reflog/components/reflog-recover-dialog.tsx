import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type { ReflogEntry } from "@/shared/types/git";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { TextField } from "@/shared/ui/text-field";
import { recoverToBranch } from "../actions";
import { useReflogDialogStore } from "../store";

interface ReflogRecoverDialogProps {
  repoPath: string;
  entry: ReflogEntry;
}

export function ReflogRecoverDialog({ repoPath, entry }: ReflogRecoverDialogProps) {
  const { t } = useTranslation();
  const hide = useReflogDialogStore((state) => state.hide);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const succeeded = await recoverToBranch(repoPath, name, entry.hash);
    setBusy(false);
    if (succeeded) {
      hide();
    }
  }

  return (
    <Dialog
      open
      title={t("reflog.recover.title", { hash: entry.shortHash })}
      description={t("reflog.recover.description")}
      onClose={hide}
      width="sm"
      dismissible={!busy}
      footer={
        <>
          <Button onClick={hide} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" type="submit" form="recover-branch-form" disabled={name.trim().length === 0} loading={busy}>
            {t("reflog.recover.confirm")}
          </Button>
        </>
      }
    >
      <form id="recover-branch-form" onSubmit={(event) => void submit(event)}>
        <TextField
          data-autofocus
          label={t("reflog.recover.name")}
          placeholder="recuperado"
          value={name}
          onChange={(event) => setName(event.target.value)}
          spellCheck={false}
        />
      </form>
    </Dialog>
  );
}
