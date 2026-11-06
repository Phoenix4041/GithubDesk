import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./button";
import { Dialog } from "./dialog";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: ReactNode;
  consequences?: string[];
  confirmLabel: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  consequences = [],
  confirmLabel,
  destructive = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  return (
    <Dialog
      open={open}
      title={title}
      onClose={onCancel}
      width="sm"
      dismissible={!loading}
      footer={
        <>
          <Button onClick={onCancel} disabled={loading} data-autofocus>
            {t("common.cancel")}
          </Button>
          <Button variant={destructive ? "danger" : "primary"} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-[13px]">
        <div className="text-muted">{description}</div>
        {consequences.length > 0 ? (
          <div className="flex gap-2.5 rounded-lg bg-danger-soft p-3 text-[12px]">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" />
            <div className="flex flex-col gap-1">
              <p className="font-medium text-danger">{t("confirm.whatYouLose")}</p>
              <ul className="list-disc pl-4 text-fg">
                {consequences.map((consequence) => (
                  <li key={consequence}>{consequence}</li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
