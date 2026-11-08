import { useQuery } from "@tanstack/react-query";
import { BarChart3, ListTodo } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { formatBytes } from "@/features/github/releases/releases-model";
import { cn } from "@/shared/lib/cn";
import { formatDateTime, formatRelativeTime } from "@/shared/lib/format";
import { repoKeys } from "@/shared/lib/query-client";
import { describeError } from "@/shared/lib/report-error";
import { cancelJob, isCancelled } from "@/shared/lib/tauri-client";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { EmptyState } from "@/shared/ui/empty-state";
import { ErrorState } from "@/shared/ui/error-state";
import { Skeleton } from "@/shared/ui/skeleton";
import { collectStats, findTodos, lineAuthor } from "../api";
import type { LineAuthor, RepoStats, TodoItem } from "../api";
import { buildCalendar, folderLabel } from "../stats-model";
import type { CalendarDay } from "../stats-model";
import { useStatsDialogStore } from "../store";

type Section = "activity" | "contributors" | "files" | "todos";

type Run =
  | { state: "running" }
  | { state: "done"; stats: RepoStats }
  | { state: "cancelled" }
  | { state: "failed"; error: unknown };

const BLAME_LIMIT = 100;

const LEVEL_CLASSES: Record<CalendarDay["level"], string> = {
  0: "bg-subtle",
  1: "bg-accent/25",
  2: "bg-accent/50",
  3: "bg-accent/75",
  4: "bg-accent",
};

function useStatsRun(repoPath: string, attempt: number): { run: Run; cancel: () => void } {
  const [result, setResult] = useState<{ attempt: number; run: Run } | null>(null);
  const jobRef = useRef<string | null>(null);

  useEffect(() => {
    const jobId = crypto.randomUUID();
    let active = true;
    jobRef.current = jobId;
    collectStats(repoPath, jobId)
      .then((stats) => {
        if (active) {
          setResult({ attempt, run: { state: "done", stats } });
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setResult({ attempt, run: isCancelled(error) ? { state: "cancelled" } : { state: "failed", error } });
        }
      });
    return () => {
      active = false;
      jobRef.current = null;
      void cancelJob(jobId).catch(() => undefined);
    };
  }, [repoPath, attempt]);

  function cancel() {
    if (jobRef.current) {
      void cancelJob(jobRef.current).catch(() => undefined);
    }
  }

  const run: Run = result && result.attempt === attempt ? result.run : { state: "running" };
  return { run, cancel };
}

function ActivitySection({ stats }: { stats: RepoStats }) {
  const { t } = useTranslation();
  const calendar = useMemo(() => buildCalendar(stats.activity, new Date()), [stats.activity]);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted">{t("stats.activity.total", { count: calendar.total })}</p>
      <div className="overflow-x-auto pb-1">
        <div role="group" aria-label={t("stats.activity.label")} className="flex w-fit gap-[3px]">
          {calendar.weeks.map((week) => (
            <div key={week[0]?.date ?? ""} className="flex flex-col gap-[3px]">
              {week.map((day) =>
                day.inRange ? (
                  <div
                    key={day.date}
                    role="img"
                    aria-label={t("stats.activity.day", { count: day.commits, date: day.date })}
                    title={t("stats.activity.day", { count: day.commits, date: day.date })}
                    className={cn("size-[11px] rounded-[2px]", LEVEL_CLASSES[day.level])}
                  />
                ) : (
                  <div key={day.date} aria-hidden className="size-[11px]" />
                ),
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-1.5 text-[11px] text-muted" aria-hidden>
        <span>{t("stats.activity.less")}</span>
        {([0, 1, 2, 3, 4] as const).map((level) => (
          <span key={level} className={cn("size-[11px] rounded-[2px]", LEVEL_CLASSES[level])} />
        ))}
        <span>{t("stats.activity.more")}</span>
      </div>
      {calendar.busiest ? (
        <p className="text-xs text-muted">
          {t("stats.activity.busiest", { date: calendar.busiest.date, count: calendar.busiest.commits })}
        </p>
      ) : null}
    </div>
  );
}

function ContributorsSection({ stats }: { stats: RepoStats }) {
  const { t, i18n } = useTranslation();
  if (stats.contributors.length === 0) {
    return <p className="text-xs text-muted">{t("stats.empty")}</p>;
  }
  return (
    <ul className="flex max-h-80 flex-col overflow-y-auto rounded-lg border border-line" aria-label={t("stats.contributors.listLabel")}>
      {stats.contributors.map((person) => (
        <li key={person.email} className="flex items-center gap-3 border-b border-line px-3 py-2 last:border-b-0">
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[13px] font-medium">{person.name}</span>
            <span className="truncate text-[11px] text-muted">{person.email}</span>
          </div>
          <div className="flex shrink-0 flex-col items-end text-[11px]">
            <span className="font-medium">{t("stats.contributors.commits", { count: person.commits })}</span>
            <span>
              <span className="text-add">+{person.additions}</span> <span className="text-danger">-{person.deletions}</span>
            </span>
            <span className="text-muted" title={formatDateTime(person.firstCommit, i18n.language)}>
              {t("stats.contributors.range", {
                first: formatRelativeTime(person.firstCommit, i18n.language),
                last: formatRelativeTime(person.lastCommit, i18n.language),
              })}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Block({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5" aria-label={title}>
      <h3 className="text-xs font-semibold">{title}</h3>
      {hint ? <p className="text-[11px] text-muted">{hint}</p> : null}
      {children}
    </section>
  );
}

function FilesSection({ stats }: { stats: RepoStats }) {
  const { t } = useTranslation();
  const listClass = "flex max-h-40 flex-col overflow-y-auto rounded-md border border-line";
  const rowClass = "flex items-center gap-2 border-b border-line px-2.5 py-1 text-xs last:border-b-0";

  return (
    <div className="flex flex-col gap-4">
      <Block title={t("stats.files.churnTitle")} hint={t("stats.files.churnHint")}>
        {stats.files.length === 0 ? (
          <p className="text-xs text-muted">{t("stats.empty")}</p>
        ) : (
          <ul className={listClass}>
            {stats.files.map((file) => (
              <li key={file.path} className={rowClass}>
                <span className="min-w-0 flex-1 truncate font-mono" title={file.path}>
                  {file.path}
                </span>
                <span className="shrink-0 text-muted">{t("stats.files.times", { count: file.commits })}</span>
                <span className="shrink-0 text-add">+{file.additions}</span>
                <span className="shrink-0 text-danger">-{file.deletions}</span>
              </li>
            ))}
          </ul>
        )}
      </Block>
      <Block title={t("stats.files.foldersTitle")}>
        {stats.folders.length === 0 ? (
          <p className="text-xs text-muted">{t("stats.empty")}</p>
        ) : (
          <ul className={listClass}>
            {stats.folders.map((folder) => (
              <li key={folder.path} className={rowClass}>
                <span className="min-w-0 flex-1 truncate font-mono">{folderLabel(folder.path)}</span>
                <span className="shrink-0 text-muted">{t("stats.contributors.commits", { count: folder.commits })}</span>
                <span className="shrink-0 text-muted">{t("stats.files.lines", { count: folder.lines })}</span>
              </li>
            ))}
          </ul>
        )}
      </Block>
      <Block title={t("stats.files.busTitle")} hint={t("stats.files.busHint")}>
        {stats.busFactor.length === 0 ? (
          <p className="text-xs text-muted">{t("stats.files.busNone")}</p>
        ) : (
          <ul className={listClass}>
            {stats.busFactor.map((file) => (
              <li key={file.path} className={rowClass}>
                <span className="min-w-0 flex-1 truncate font-mono" title={file.path}>
                  {file.path}
                </span>
                <span className="shrink-0">{file.author || file.email}</span>
                <span className="shrink-0 text-muted">{formatBytes(file.size)}</span>
                <span className="shrink-0 text-muted">{t("stats.contributors.commits", { count: file.commits })}</span>
              </li>
            ))}
          </ul>
        )}
      </Block>
    </div>
  );
}

function TodoAuthor({ repoPath, item }: { repoPath: string; item: TodoItem }) {
  const { t, i18n } = useTranslation();
  const [state, setState] = useState<{ kind: "idle" } | { kind: "loading" } | { kind: "done"; author: LineAuthor } | { kind: "failed" }>({
    kind: "idle",
  });

  async function load() {
    setState({ kind: "loading" });
    try {
      setState({ kind: "done", author: await lineAuthor(repoPath, item.path, item.line) });
    } catch {
      setState({ kind: "failed" });
    }
  }

  if (state.kind === "done") {
    return (
      <span className="shrink-0 text-[11px] text-muted">
        {state.author.committed
          ? t("stats.todos.author", { author: state.author.author, date: formatRelativeTime(state.author.time, i18n.language) })
          : t("stats.todos.notCommitted")}
      </span>
    );
  }
  if (state.kind === "failed") {
    return <span className="shrink-0 text-[11px] text-danger">{t("stats.todos.authorFailed")}</span>;
  }
  return (
    <Button
      size="sm"
      variant="ghost"
      loading={state.kind === "loading"}
      aria-label={t("stats.todos.whoLabel", { path: item.path, line: item.line })}
      onClick={() => void load()}
    >
      {t("stats.todos.who")}
    </Button>
  );
}

function TodosSection({ repoPath }: { repoPath: string }) {
  const { t } = useTranslation();
  const todos = useQuery({
    queryKey: repoKeys.todos(repoPath),
    queryFn: () => findTodos(repoPath),
    staleTime: 60_000,
  });

  if (todos.isPending) {
    return <Skeleton className="h-40" />;
  }
  if (todos.isError) {
    const description = describeError(todos.error);
    return <ErrorState title={description.title} message={description.message} onRetry={() => void todos.refetch()} />;
  }
  if (todos.data.items.length === 0) {
    return <EmptyState icon={<ListTodo className="size-5" />} title={t("stats.todos.emptyTitle")} description={t("stats.todos.empty")} />;
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted">{t("stats.todos.count", { count: todos.data.items.length })}</p>
      {todos.data.truncated ? (
        <p role="status" className="text-xs text-warning">
          {t("stats.todos.truncated", { count: todos.data.items.length })}
        </p>
      ) : null}
      <ul className="flex max-h-80 flex-col overflow-y-auto rounded-lg border border-line" aria-label={t("stats.todos.listLabel")}>
        {todos.data.items.map((item, index) => (
          <li key={`${item.path}:${item.line}`} className="flex items-center gap-2 border-b border-line px-2.5 py-1.5 last:border-b-0">
            <span className="shrink-0 rounded bg-subtle px-1.5 py-0.5 font-mono text-[10px] font-semibold">{item.kind}</span>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-mono text-[11px] text-muted" title={`${item.path}:${item.line}`}>
                {item.path}:{item.line}
              </span>
              <span className="truncate font-mono text-xs" title={item.text}>
                {item.text}
              </span>
            </div>
            {index < BLAME_LIMIT ? <TodoAuthor repoPath={repoPath} item={item} /> : null}
          </li>
        ))}
      </ul>
      {todos.data.items.length > BLAME_LIMIT ? <p className="text-[11px] text-muted">{t("stats.todos.blameLimit", { count: BLAME_LIMIT })}</p> : null}
    </div>
  );
}

function StatsBody({ repoPath, onClose }: { repoPath: string; onClose: () => void }) {
  const { t } = useTranslation();
  const [section, setSection] = useState<Section>("activity");
  const [attempt, setAttempt] = useState(0);
  const { run, cancel } = useStatsRun(repoPath, attempt);

  const sections: Array<{ id: Section; label: string }> = [
    { id: "activity", label: t("stats.tabs.activity") },
    { id: "contributors", label: t("stats.tabs.contributors") },
    { id: "files", label: t("stats.tabs.files") },
    { id: "todos", label: t("stats.tabs.todos") },
  ];

  let historyBody: ReactNode = null;
  if (run.state === "running") {
    historyBody = (
      <div className="flex flex-col gap-2" role="status">
        <p className="text-xs text-muted">{t("stats.running")}</p>
        <Skeleton className="h-32" />
      </div>
    );
  } else if (run.state === "cancelled") {
    historyBody = (
      <div className="flex flex-col items-start gap-2">
        <p className="text-xs text-muted">{t("stats.cancelled")}</p>
        <Button size="sm" onClick={() => setAttempt((value) => value + 1)}>
          {t("stats.retry")}
        </Button>
      </div>
    );
  } else if (run.state === "failed") {
    const description = describeError(run.error);
    historyBody = <ErrorState title={description.title} message={description.message} onRetry={() => setAttempt((value) => value + 1)} />;
  } else if (section === "activity") {
    historyBody = <ActivitySection stats={run.stats} />;
  } else if (section === "contributors") {
    historyBody = <ContributorsSection stats={run.stats} />;
  } else if (section === "files") {
    historyBody = <FilesSection stats={run.stats} />;
  }

  return (
    <Dialog
      open
      title={t("stats.title")}
      description={t("stats.description")}
      onClose={onClose}
      width="lg"
      footer={
        <>
          {run.state === "running" ?<Button onClick={cancel}>{t("common.cancel")}</Button> : null}
          <Button onClick={onClose}>{t("common.close")}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div role="tablist" aria-label={t("stats.tabsLabel")} className="inline-flex w-fit gap-1 rounded-lg bg-subtle p-1">
          {sections.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={section === item.id}
              onClick={() => setSection(item.id)}
              className={cn(
                "h-7 cursor-pointer rounded-md px-3 text-xs font-medium transition-colors duration-150",
                section === item.id ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        {run.state === "done" && run.stats.truncated && section !== "todos" ? (
          <p role="status" className="rounded-md bg-subtle px-3 py-2 text-xs text-warning">
            {t("stats.truncated", { count: run.stats.limit })}
          </p>
        ) : null}
        {run.state === "done" && run.stats.commits === 0 && section !== "todos" ? (
          <EmptyState icon={<BarChart3 className="size-5" />} title={t("stats.emptyTitle")} description={t("stats.empty")} />
        ) : section === "todos" ? (
          <TodosSection repoPath={repoPath} />
        ) : (
          historyBody
        )}
      </div>
    </Dialog>
  );
}

export function StatsDialog({ repoPath }: { repoPath: string }) {
  const open = useStatsDialogStore((state) => state.open);
  const hide = useStatsDialogStore((state) => state.hide);
  return open ? <StatsBody repoPath={repoPath} onClose={hide} /> : null;
}
