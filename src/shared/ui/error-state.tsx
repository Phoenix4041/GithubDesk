import { TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";
import { Button } from "./button";

interface ErrorStateProps {
  title: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({ title, message, onRetry, className }: ErrorStateProps) {
  const { t } = useTranslation();
  return (
    <div
      role="alert"
      className={cn("flex flex-1 animate-[fade-in_250ms_ease-out] flex-col items-center justify-center gap-3 px-6 py-10 text-center", className)}
    >
      <div className="grid size-11 place-items-center rounded-xl bg-danger-soft text-danger">
        <TriangleAlert className="size-5" />
      </div>
      <div className="flex max-w-[40ch] flex-col gap-1">
        <p className="text-sm font-medium">{title}</p>
        {message ? <p className="selectable text-xs break-words text-muted">{message}</p> : null}
      </div>
      {onRetry ? (
        <Button size="sm" onClick={onRetry}>
          {t("common.retry")}
        </Button>
      ) : null}
    </div>
  );
}
