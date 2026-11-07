import { i18next } from "@/i18n";
import { showToast } from "@/shared/ui/toast-store";
import type { ToastAction } from "@/shared/ui/toast-store";
import type { AppError, ErrorKind } from "@/shared/types/git";
import { CommandError, isCancelled } from "./tauri-client";
import { useUiStore } from "./ui-store";

const MAX_DETAIL_LENGTH = 280;

export interface ErrorHandlers {
  retry?: () => void;
  pull?: () => void;
  forcePush?: () => void;
  publish?: () => void;
  forceDelete?: () => void;
}

export interface ErrorDescription {
  kind: ErrorKind;
  title: string;
  message: string;
  appError: AppError | null;
}

export function describeError(error: unknown): ErrorDescription {
  const appError = error instanceof CommandError ? error.appError : null;
  const kind: ErrorKind = appError?.kind ?? "unknown";
  const title = i18next.t(`errors.${kind}.title`);
  let message = i18next.t(`errors.${kind}.message`);
  if (kind === "unknown" || kind === "io" || kind === "hookRejected") {
    const detail = appError?.detail ?? (error instanceof Error ? error.message : "");
    if (detail) {
      message = `${message} ${detail.slice(0, MAX_DETAIL_LENGTH)}`;
    }
  }
  return { kind, title, message, appError };
}

function actionsFor(appError: AppError | null, handlers: ErrorHandlers): ToastAction[] {
  const actions: ToastAction[] = [];
  switch (appError?.suggestedAction) {
    case "pull":
      if (handlers.pull) {
        actions.push({ label: i18next.t("errors.actions.pull"), run: handlers.pull });
      }
      break;
    case "publishBranch":
      if (handlers.publish) {
        actions.push({ label: i18next.t("errors.actions.publishBranch"), run: handlers.publish });
      }
      break;
    case "retry":
      if (handlers.retry) {
        actions.push({ label: i18next.t("errors.actions.retry"), run: handlers.retry });
      }
      break;
    case "showChanges":
      actions.push({
        label: i18next.t("errors.actions.showChanges"),
        run: () => useUiStore.getState().setTab("changes"),
      });
      break;
    case "forceDelete":
      if (handlers.forceDelete) {
        actions.push({ label: i18next.t("errors.actions.forceDelete"), run: handlers.forceDelete });
      }
      break;
    default:
      break;
  }
  if (appError?.kind === "remoteAhead" && handlers.forcePush) {
    actions.push({ label: i18next.t("errors.actions.forcePush"), run: handlers.forcePush });
  }
  return actions;
}

export function reportError(error: unknown, handlers: ErrorHandlers = {}): void {
  if (isCancelled(error)) {
    return;
  }
  const description = describeError(error);
  showToast({
    kind: "error",
    title: description.title,
    message: description.message,
    actions: actionsFor(description.appError, handlers),
  });
}
