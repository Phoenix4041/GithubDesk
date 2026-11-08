import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { describeError } from "@/shared/lib/report-error";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";

export function SectionFrame({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4" aria-label={title}>
      <header className="flex flex-col gap-1">
        <h3 className="text-[15px] font-semibold">{title}</h3>
        {description ? <p className="text-xs text-muted">{description}</p> : null}
      </header>
      {children}
    </section>
  );
}

export function QueryError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useTranslation();
  const description = describeError(error);
  return (
    <div className="flex flex-col items-start gap-2 text-xs" role="alert">
      <p className="font-medium text-danger">{description.title}</p>
      <p className="text-muted">{description.message}</p>
      <Button size="sm" onClick={onRetry}>
        {t("common.retry")}
      </Button>
    </div>
  );
}

interface ToggleRowProps {
  label: string;
  hint?: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}

export function ToggleRow({ label, hint, checked, disabled, onChange }: ToggleRowProps) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 text-[13px]">
      <Checkbox label={label} checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} className="mt-0.5" />
      <span className="flex flex-col gap-0.5">
        <span>{label}</span>
        {hint ? <span className="text-xs text-muted">{hint}</span> : null}
      </span>
    </label>
  );
}
