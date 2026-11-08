import { useState } from "react";
import { useTranslation } from "react-i18next";
import { i18next } from "@/i18n";
import { queryClient } from "@/shared/lib/query-client";
import { reportError } from "@/shared/lib/report-error";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { showToast } from "@/shared/ui/toast-store";
import { setCommitTemplate } from "../api";
import { commitExtrasKeys } from "../queries";

interface CommitTemplateDialogProps {
  repoPath: string;
  initial: string;
  onClose: () => void;
}

export function CommitTemplateDialog({ repoPath, initial, onClose }: CommitTemplateDialogProps) {
  const { t } = useTranslation();
  const [text, setText] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await setCommitTemplate(repoPath, text);
      queryClient.setQueryData(commitExtrasKeys.template(repoPath), text.replace(/\r\n/g, "\n").trimEnd());
      showToast({ kind: "success", title: i18next.t("commit.template.saved") });
      onClose();
    } catch (error) {
      reportError(error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      title={t("commit.template.title")}
      description={t("commit.template.description")}
      onClose={onClose}
      width="sm"
      footer={
        <>
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            {t("commit.template.save")}
          </Button>
        </>
      }
    >
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        aria-label={t("commit.template.field")}
        rows={6}
        maxLength={4000}
        className="w-full resize-none rounded-md border border-line bg-surface px-2.5 py-1.5 font-mono text-xs text-fg focus-visible:border-accent focus-visible:outline-none"
        spellCheck={false}
      />
    </Dialog>
  );
}
