import { useTranslation } from "react-i18next";
import { useStatus } from "@/features/changes/queries";
import { useCompareStore } from "@/features/compare/store";
import { useGithubRepo } from "@/features/github/use-github-repo";
import { useStashStore } from "@/features/stash/store";
import { cn } from "@/shared/lib/cn";
import { useUiStore } from "@/shared/lib/ui-store";
import type { WorkspaceTab } from "@/shared/lib/ui-store";

interface WorkspaceTabsProps {
  repoPath: string;
}

export function WorkspaceTabs({ repoPath }: WorkspaceTabsProps) {
  const { t } = useTranslation();
  const tab = useUiStore((state) => state.tab);
  const setTab = useUiStore((state) => state.setTab);
  const status = useStatus(repoPath);
  const changeCount = status.data?.entries.length ?? 0;
  const stashSelected = useStashStore((state) => state.selectedHash !== null);
  const compareOpen = useCompareStore((state) => state.base !== null);
  const onGithub = useGithubRepo(repoPath).context !== null;

  const tabs: Array<{ id: WorkspaceTab; label: string; count?: number }> = [
    { id: "changes", label: t("tabs.changes"), count: changeCount },
    { id: "history", label: t("tabs.history") },
  ];
  if (stashSelected) {
    tabs.push({ id: "stash", label: t("tabs.stash") });
  }
  if (compareOpen) {
    tabs.push({ id: "compare", label: t("tabs.compare") });
  }
  if (onGithub) {
    tabs.push(
      { id: "pulls", label: t("tabs.pulls") },
      { id: "issues", label: t("tabs.issues") },
      { id: "actions", label: t("tabs.actions") },
    );
  }

  return (
    <div role="tablist" aria-label={t("tabs.label")} className="flex h-10 shrink-0 items-end gap-1 border-b border-line px-3">
      {tabs.map((item) => {
        const selected = item.id === tab;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`tab-${item.id}`}
            aria-selected={selected}
            aria-controls={`panel-${item.id}`}
            onClick={() => setTab(item.id)}
            className={cn(
              "relative flex h-9 cursor-pointer items-center gap-2 px-3 text-[13px] font-medium transition-colors duration-150",
              selected ? "text-fg" : "text-muted hover:text-fg",
            )}
          >
            {item.label}
            {item.count ? (
              <span className="rounded-full bg-accent-soft px-1.5 py-px text-[10px] text-accent tabular-nums">{item.count}</span>
            ) : null}
            <span
              aria-hidden="true"
              className={cn(
                "absolute inset-x-2 bottom-0 h-0.5 origin-center rounded-full bg-accent transition-transform duration-200 ease-out-expo",
                selected ? "scale-x-100" : "scale-x-0",
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
