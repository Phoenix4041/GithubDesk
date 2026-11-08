import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { TextAreaField, TextField } from "@/shared/ui/text-field";

interface EditPostDialogProps {
  open: boolean;
  title: string;
  initialTitle: string;
  initialBody: string;
  onSave: (title: string, body: string) => Promise<boolean>;
  onClose: () => void;
}

function EditForm({ title, initialTitle, initialBody, onSave, onClose }: Omit<EditPostDialogProps, "open">) {
  const { t } = useTranslation();
  const [draftTitle, setDraftTitle] = useState(initialTitle);
  const [draftBody, setDraftBody] = useState(initialBody);
  const [busy, setBusy] = useState(false);
  const titleReady = draftTitle.trim().length > 0;
  const changed = draftTitle.trim() !== initialTitle || draftBody !== initialBody;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!titleReady || !changed || busy) {
      return;
    }
    setBusy(true);
    const saved = await onSave(draftTitle.trim(), draftBody);
    setBusy(false);
    if (saved) {
      onClose();
    }
  }

  return (
    <Dialog
      open
      title={title}
      onClose={onClose}
      dismissible={!busy}
      width="lg"
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" type="submit" form="edit-post-form" disabled={!titleReady || !changed} loading={busy}>
            {t("github.collab.save")}
          </Button>
        </>
      }
    >
      <form id="edit-post-form" onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
        <TextField
          data-autofocus
          label={t("github.collab.titleLabel")}
          value={draftTitle}
          onChange={(event) => setDraftTitle(event.target.value)}
        />
        <TextAreaField
          label={t("github.collab.bodyLabel")}
          value={draftBody}
          rows={10}
          onChange={(event) => setDraftBody(event.target.value)}
        />
      </form>
    </Dialog>
  );
}

export function EditPostDialog({ open, ...rest }: EditPostDialogProps) {
  if (!open) {
    return null;
  }
  return <EditForm {...rest} />;
}
