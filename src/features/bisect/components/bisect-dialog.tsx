import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { TextField } from "@/shared/ui/text-field";
import { startBisectSession } from "../actions";
import { useBisectDialogStore } from "../store";
import type { BisectPreset } from "../store";

interface FormProps {
  repoPath: string;
  preset: BisectPreset;
  onClose: () => void;
}

function BisectForm({ repoPath, preset, onClose }: FormProps) {
  const { t } = useTranslation();
  const [bad, setBad] = useState(preset.bad ?? "HEAD");
  const [good, setGood] = useState(preset.good ?? "");
  const [busy, setBusy] = useState(false);
  const ready = bad.trim() !== "" && good.trim() !== "";

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready || busy) {
      return;
    }
    setBusy(true);
    const succeeded = await startBisectSession(repoPath, bad, good);
    setBusy(false);
    if (succeeded) {
      onClose();
    }
  }

  return (
    <Dialog
      open
      title={t("bisect.dialog.title")}
      description={t("bisect.dialog.description")}
      onClose={onClose}
      dismissible={!busy}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" type="submit" form="bisect-form" disabled={!ready} loading={busy}>
            {t("bisect.dialog.submit")}
          </Button>
        </>
      }
    >
      <form id="bisect-form" onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
        <TextField
          label={t("bisect.dialog.bad")}
          hint={t("bisect.dialog.badHint")}
          value={bad}
          onChange={(event) => setBad(event.target.value)}
          spellCheck={false}
        />
        <TextField
          label={t("bisect.dialog.good")}
          hint={t("bisect.dialog.goodHint")}
          placeholder={t("bisect.dialog.goodPlaceholder")}
          value={good}
          onChange={(event) => setGood(event.target.value)}
          spellCheck={false}
          autoFocus={!preset.good}
        />
        <p className="rounded-md bg-subtle px-3 py-2 text-xs text-muted">{t("bisect.dialog.cleanTree")}</p>
      </form>
    </Dialog>
  );
}

export function BisectDialog({ repoPath }: { repoPath: string }) {
  const open = useBisectDialogStore((state) => state.open);
  const preset = useBisectDialogStore((state) => state.preset);
  const hide = useBisectDialogStore((state) => state.hide);
  if (!open) {
    return null;
  }
  return <BisectForm key={`${preset.bad ?? ""}|${preset.good ?? ""}`} repoPath={repoPath} preset={preset} onClose={hide} />;
}
