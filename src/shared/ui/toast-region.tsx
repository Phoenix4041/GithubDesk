import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";
import { IconButton } from "./icon-button";
import { useToastStore } from "./toast-store";
import type { ToastKind } from "./toast-store";

const kindStyles: Record<ToastKind, { icon: typeof Info; className: string }> = {
  success: { icon: CircleCheck, className: "text-success" },
  error: { icon: CircleAlert, className: "text-danger" },
  info: { icon: Info, className: "text-accent" },
};

export function ToastRegion() {
  const { t } = useTranslation();
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2"
    >
      {toasts.map((toast) => {
        const { icon: Icon, className } = kindStyles[toast.kind];
        return (
          <div
            key={toast.id}
            role={toast.kind === "error" ? "alert" : "status"}
            className="pointer-events-auto flex animate-[pop-in_220ms_var(--ease-out-expo)] items-start gap-3 rounded-lg border border-line bg-surface p-3 shadow-xl"
          >
            <Icon className={cn("mt-0.5 size-4 shrink-0", className)} />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="text-[13px] font-medium">{toast.title}</p>
              {toast.message ? <p className="selectable text-xs break-words text-muted">{toast.message}</p> : null}
              {toast.actions.length > 0 ? (
                <div className="mt-1 flex gap-3">
                  {toast.actions.map((action) => (
                    <button
                      key={action.label}
                      type="button"
                      className="cursor-pointer text-xs font-medium text-accent hover:underline"
                      onClick={() => {
                        dismiss(toast.id);
                        action.run();
                      }}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <IconButton label={t("common.close")} onClick={() => dismiss(toast.id)} className="-mt-1 -mr-1 size-6">
              <X className="size-3.5" />
            </IconButton>
          </div>
        );
      })}
    </div>
  );
}
