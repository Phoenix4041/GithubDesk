import { useEffect, useRef } from "react";
import { i18next } from "@/i18n";
import { showToast } from "@/shared/ui/toast-store";
import { useRescueList } from "./queries";
import { useRescueDialogStore } from "./store";

export function reasonLabel(reason: string): string {
  switch (reason) {
    case "discard":
      return i18next.t("rescue.reasons.discard");
    case "reset":
      return i18next.t("rescue.reasons.reset");
    case "cleanup":
      return i18next.t("rescue.reasons.cleanup");
    case "abort":
      return i18next.t("rescue.reasons.abort");
    case "branch-delete":
      return i18next.t("rescue.reasons.branch-delete");
    case "stash-drop":
      return i18next.t("rescue.reasons.stash-drop");
    case "before-restore":
      return i18next.t("rescue.reasons.before-restore");
    default:
      return i18next.t("rescue.reasons.other");
  }
}

export function useRescueNotice(repoPath: string): void {
  const list = useRescueList(repoPath);
  const known = useRef<{ repoPath: string; ids: Set<string> } | null>(null);
  const entries = list.data;

  useEffect(() => {
    if (!entries) {
      return;
    }
    const previous = known.current;
    const ids = new Set(entries.map((entry) => entry.id));
    known.current = { repoPath, ids };
    if (!previous || previous.repoPath !== repoPath) {
      return;
    }
    const fresh = entries.filter((entry) => !previous.ids.has(entry.id) && entry.reason !== "before-restore");
    if (fresh.length === 0) {
      return;
    }
    showToast({
      kind: "info",
      title: i18next.t("rescue.saved"),
      message: reasonLabel(fresh[0]?.reason ?? "other"),
      actions: [{ label: i18next.t("rescue.view"), run: () => useRescueDialogStore.getState().show() }],
    });
  }, [entries, repoPath]);
}
