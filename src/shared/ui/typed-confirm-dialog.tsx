import { TriangleAlert } from "lucide-react";
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./button";
import { Dialog } from "./dialog";
import { TextField } from "./text-field";

interface TypedConfirmDialogProps {
  open: boolean;
  title: string;
  description: ReactNode;
  consequences?: string[];
  expected: string;
  confirmLabel: string;
  loading?: boolean;
  onConfirm: (typed: string) => void;
  onCancel: () => void;
}

function TypedForm({
  title,
  description,
  consequences = [],
  expected,
  confirmLabel,
  loading = false,
  onConfirm,
  onCancel,
}: Omit<TypedConfirmDialogProps, "open">) {
  const { t } = useTranslation();
  const [typed, setTyped] = useState("");
  const matches = typed === expected;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (matches && !loading) {
      onConfirm(typed);
    }
  }

  return (
    <Dialog
      open
      title={title}
      onClose={onCancel}
      width="sm"
      dismissible={!loading}
      footer={
        <>
          <Button onClick={onCancel} disabled={loading}>
            {t("common.cancel")}
          </Button>
          <Button variant="danger" type="submit" form="typed-confirm-form" disabled={!matches} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <form id="typed-confirm-form" onSubmit={submit} className="flex flex-col gap-3 text-[13px]">
        <div className="text-muted">{description}</div>
        {consequences.length > 0 ? (
          <div className="flex gap-2.5 rounded-lg bg-danger-soft p-3 text-[12px]">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" />
            <ul className="list-disc pl-4 text-fg">
              {consequences.map((consequence) => (
                <li key={consequence}>{consequence}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <TextField
          data-autofocus
          label={t("confirm.typeToConfirm", { value: expected })}
          value={typed}
          disabled={loading}
          onChange={(event) => setTyped(event.target.value)}
          spellCheck={false}
          autoComplete="off"
        />
      </form>
    </Dialog>
  );
}

export function TypedConfirmDialog({ open, ...rest }: TypedConfirmDialogProps) {
  if (!open) {
    return null;
  }
  return <TypedForm {...rest} />;
}
