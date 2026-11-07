import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/shared/ui/button";
import { TextAreaField } from "@/shared/ui/text-field";

interface CommentComposerProps {
  onSubmit: (body: string) => Promise<boolean>;
  extraActions?: ReactNode;
}

export function CommentComposer({ onSubmit, extraActions }: CommentComposerProps) {
  const { t } = useTranslation();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || body.trim().length === 0) {
      return;
    }
    setBusy(true);
    const sent = await onSubmit(body);
    setBusy(false);
    if (sent) {
      setBody("");
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-2">
      <TextAreaField
        label={t("github.composer.label")}
        rows={4}
        value={body}
        disabled={busy}
        onChange={(event) => setBody(event.target.value)}
      />
      <div className="flex flex-wrap items-center justify-end gap-2">
        {extraActions}
        <Button type="submit" variant="primary" size="sm" disabled={body.trim().length === 0} loading={busy}>
          {t("github.composer.submit")}
        </Button>
      </div>
    </form>
  );
}
