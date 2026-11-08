import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/shared/ui/button";
import { TextField } from "@/shared/ui/text-field";
import { TypedConfirmDialog } from "@/shared/ui/typed-confirm-dialog";
import type { GithubTarget } from "../../target";
import { moveRepository, removeRepository } from "../actions";
import { SectionFrame } from "./section-frame";

export function DangerSection({ target, canAdmin }: { target: GithubTarget; canAdmin: boolean }) {
  const { t } = useTranslation();
  const fullName = `${target.owner}/${target.repo}`;
  const [newOwner, setNewOwner] = useState("");
  const [newName, setNewName] = useState("");
  const [transferring, setTransferring] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);

  function askTransfer(event: FormEvent) {
    event.preventDefault();
    if (canAdmin && newOwner.trim() !== "") {
      setTransferring(true);
    }
  }

  async function transfer(typed: string) {
    setBusy(true);
    const moved = await moveRepository(target, newOwner.trim(), newName.trim() === "" ? null : newName.trim(), typed);
    setBusy(false);
    setTransferring(false);
    if (moved) {
      setNewOwner("");
      setNewName("");
    }
  }

  async function destroy(typed: string) {
    setBusy(true);
    await removeRepository(target, typed);
    setBusy(false);
    setDeleting(false);
  }

  return (
    <SectionFrame title={t("github.settings.sections.danger")} description={t("github.settings.danger.intro")}>
      <form onSubmit={askTransfer} className="flex flex-col gap-3 rounded-lg border border-danger/40 p-4" aria-label={t("github.settings.danger.transferTitle")}>
        <h4 className="text-[13px] font-semibold">{t("github.settings.danger.transferTitle")}</h4>
        <p className="text-xs text-muted">{t("github.settings.danger.transferDescription")}</p>
        <div className="flex flex-wrap gap-3">
          <div className="min-w-48 flex-1">
            <TextField
              label={t("github.settings.danger.newOwner")}
              value={newOwner}
              disabled={!canAdmin || busy}
              onChange={(event) => setNewOwner(event.target.value)}
              spellCheck={false}
            />
          </div>
          <div className="min-w-48 flex-1">
            <TextField
              label={t("github.settings.danger.newName")}
              hint={t("github.settings.danger.newNameHint")}
              value={newName}
              disabled={!canAdmin || busy}
              onChange={(event) => setNewName(event.target.value)}
              spellCheck={false}
            />
          </div>
        </div>
        <div>
          <Button type="submit" variant="danger" disabled={!canAdmin || newOwner.trim() === ""}>
            {t("github.settings.danger.transfer")}
          </Button>
        </div>
      </form>

      <div className="flex flex-col gap-3 rounded-lg border border-danger/40 p-4">
        <h4 className="text-[13px] font-semibold">{t("github.settings.danger.deleteTitle")}</h4>
        <p className="text-xs text-muted">{t("github.settings.danger.deleteDescription")}</p>
        <div>
          <Button variant="danger" disabled={!canAdmin} onClick={() => setDeleting(true)}>
            {t("github.settings.danger.delete")}
          </Button>
        </div>
      </div>

      <TypedConfirmDialog
        open={transferring}
        title={t("github.settings.danger.transferConfirmTitle", { name: fullName })}
        description={t("github.settings.danger.transferConfirmDescription", { owner: newOwner.trim() })}
        consequences={[t("github.settings.danger.transferConsequence")]}
        expected={fullName}
        confirmLabel={t("github.settings.danger.transfer")}
        loading={busy}
        onConfirm={(typed) => void transfer(typed)}
        onCancel={() => setTransferring(false)}
      />
      <TypedConfirmDialog
        open={deleting}
        title={t("github.settings.danger.deleteConfirmTitle", { name: fullName })}
        description={t("github.settings.danger.deleteConfirmDescription")}
        consequences={[t("github.settings.danger.deleteConsequence")]}
        expected={fullName}
        confirmLabel={t("github.settings.danger.delete")}
        loading={busy}
        onConfirm={(typed) => void destroy(typed)}
        onCancel={() => setDeleting(false)}
      />
    </SectionFrame>
  );
}
