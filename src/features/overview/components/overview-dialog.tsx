import { useQuery } from "@tanstack/react-query";
import { CloudDownload, FolderGit2, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { openRepositoryFromPath } from "@/features/repositories/actions";
import { useRepositoriesStore } from "@/features/repositories/store";
import { useSettingsStore } from "@/features/settings/store";
import { cancelJob } from "@/shared/lib/tauri-client";
import { reportError } from "@/shared/lib/report-error";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { EmptyState } from "@/shared/ui/empty-state";
import { SelectField, TextField } from "@/shared/ui/text-field";
import { fetchAll, loadStatuses, pullAll } from "../api";
import type { OutcomeState, RepoOutcome, RepoRow } from "../api";
import { useOverviewDialogStore } from "../store";

const ALL = "";

function outcomeLabel(outcome: RepoOutcome, t: (key: "overview.outcome.done" | "overview.outcome.updated" | "overview.outcome.upToDate" | "overview.outcome.skipped" | "overview.outcome.failed") => string): string {
  const labels: Record<OutcomeState, string> = {
    done: t("overview.outcome.done"),
    updated: t("overview.outcome.updated"),
    upToDate: t("overview.outcome.upToDate"),
    skipped: t("overview.outcome.skipped"),
    failed: t("overview.outcome.failed"),
  };
  return labels[outcome.state];
}

function baseName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

function Body() {
  const { t } = useTranslation();
  const recents = useRepositoriesStore((state) => state.recents);
  const groups = useSettingsStore((state) => state.repoGroups);
  const setGroup = useSettingsStore((state) => state.setRepoGroup);
  const hide = useOverviewDialogStore((state) => state.hide);
  const [filter, setFilter] = useState(ALL);
  const [running, setRunning] = useState<{ jobId: string } | null>(null);
  const [outcomes, setOutcomes] = useState<RepoOutcome[]>([]);

  const known = Array.from(new Set(Object.values(groups).filter((name) => name.length > 0))).sort();
  const visible = recents.filter((recent) => filter === ALL || groups[recent.path] === filter);
  const paths = visible.map((recent) => recent.path);
  const statuses = useQuery({
    queryKey: ["overview", "statuses", paths],
    queryFn: () => loadStatuses(paths),
    enabled: paths.length > 0,
    staleTime: 15_000,
    retry: false,
  });
  const rows = new Map<string, RepoRow>((statuses.data ?? []).map((row) => [row.path, row]));

  async function run(kind: "fetch" | "pull") {
    const jobId = crypto.randomUUID();
    setRunning({ jobId });
    setOutcomes([]);
    try {
      const result = kind === "fetch" ? await fetchAll(paths, jobId) : await pullAll(paths, jobId);
      setOutcomes(result);
    } catch (error) {
      reportError(error);
    } finally {
      setRunning(null);
      await statuses.refetch();
    }
  }

  if (recents.length === 0) {
    return <EmptyState icon={<FolderGit2 className="size-5" />} title={t("overview.empty.title")} description={t("overview.empty.description")} />;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <SelectField label={t("overview.filter")} value={filter} onChange={(event) => setFilter(event.target.value)} className="w-44">
          <option value={ALL}>{t("overview.allGroups")}</option>
          {known.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </SelectField>
        <Button icon={<RefreshCw className="size-3.5" />} disabled={running !== null || paths.length === 0} onClick={() => void statuses.refetch()}>
          {t("overview.refresh")}
        </Button>
        <Button icon={<CloudDownload className="size-3.5" />} disabled={running !== null || paths.length === 0} onClick={() => void run("fetch")}>
          {t("overview.fetchAll")}
        </Button>
        <Button variant="primary" disabled={running !== null || paths.length === 0} onClick={() => void run("pull")}>
          {t("overview.pullAll")}
        </Button>
        {running ? (
          <Button onClick={() => void cancelJob(running.jobId)}>{t("common.cancel")}</Button>
        ) : null}
      </div>

      <ul className="flex max-h-72 flex-col overflow-y-auto rounded-lg border border-line" aria-label={t("overview.listLabel")}>
        {visible.map((recent) => {
          const row = rows.get(recent.path);
          return (
            <li key={recent.path} className="flex items-center gap-2 border-b border-line px-3 py-2 last:border-b-0">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[13px] font-medium" title={recent.path}>
                  {baseName(recent.path)}
                </span>
                <span className="truncate text-[11px] text-muted">
                  {row === undefined
                    ? t("overview.loading")
                    : !row.available
                      ? t("overview.unavailable")
                      : [
                          row.branch ?? "",
                          row.changes > 0 ? t("overview.changes", { count: row.changes }) : "",
                          row.ahead > 0 ? `↑${row.ahead}` : "",
                          row.behind > 0 ? `↓${row.behind}` : "",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                </span>
              </div>
              <TextField
                label={t("overview.group")}
                value={groups[recent.path] ?? ""}
                onChange={(event) => setGroup(recent.path, event.target.value)}
                className="h-7 w-28 text-xs"
              />
              <Button
                size="sm"
                onClick={() => {
                  void openRepositoryFromPath(recent.path).then((opened) => {
                    if (opened) {
                      hide();
                    }
                  });
                }}
              >
                {t("overview.open")}
              </Button>
            </li>
          );
        })}
      </ul>

      {outcomes.length > 0 ? (
        <ul className="flex max-h-32 flex-col overflow-y-auto text-xs" aria-label={t("overview.resultsLabel")}>
          {outcomes.map((outcome) => (
            <li key={outcome.path} className="flex gap-2 py-0.5">
              <span className="min-w-0 flex-1 truncate">{baseName(outcome.path)}</span>
              <span className={outcome.state === "failed" ? "text-danger" : "text-muted"}>
                {outcomeLabel(outcome, t)}
                {outcome.detail ? ` (${outcome.detail})` : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-xs text-muted">{t("overview.hint")}</p>
    </div>
  );
}

export function OverviewDialog() {
  const { t } = useTranslation();
  const open = useOverviewDialogStore((state) => state.open);
  const hide = useOverviewDialogStore((state) => state.hide);
  if (!open) {
    return null;
  }
  return (
    <Dialog open title={t("overview.title")} description={t("overview.description")} onClose={hide} width="lg" footer={<Button onClick={hide}>{t("common.close")}</Button>}>
      <Body />
    </Dialog>
  );
}
