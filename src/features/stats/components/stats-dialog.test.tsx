import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { mockIPC } from "@tauri-apps/api/mocks";
import type { ParseKeys } from "i18next";
import { afterEach, describe, expect, it } from "vitest";
import { i18next } from "@/i18n";
import { renderWithProviders } from "@/test/render";
import type { LineAuthor, RepoStats, TodoReport } from "../api";
import { dayKey } from "../stats-model";
import { useStatsDialogStore } from "../store";
import { StatsDialog } from "./stats-dialog";

type Calls = Record<string, Array<Record<string, unknown>>>;

const t = (key: ParseKeys, options?: Record<string, unknown>) => i18next.t(key, options);

const TODAY = dayKey(new Date());

const STATS: RepoStats = {
  commits: 3,
  limit: 20000,
  truncated: true,
  activity: [{ date: TODAY, commits: 3 }],
  contributors: [
    { name: "Ana", email: "ana@example.com", commits: 2, additions: 10, deletions: 1, firstCommit: 1_700_000_000, lastCommit: 1_700_000_100 },
    { name: "Beto", email: "beto@example.com", commits: 1, additions: 4, deletions: 0, firstCommit: 1_700_000_050, lastCommit: 1_700_000_050 },
  ],
  files: [{ path: "src/engine.rs", commits: 5, additions: 40, deletions: 2, authors: 1 }],
  folders: [{ path: "src", commits: 5, lines: 42 }],
  busFactor: [{ path: "src/engine.rs", commits: 5, size: 2048, author: "Ana", email: "ana@example.com" }],
};

const TODOS: TodoReport = {
  items: [{ path: "docs/guide.md", line: 2, kind: "TODO", text: "// TODO: write it" }],
  truncated: false,
};

const AUTHOR: LineAuthor = { hash: "abc", author: "Beto", email: "beto@example.com", time: 1_700_000_000, committed: true };

function serve(statsResult: () => RepoStats | Promise<RepoStats> = () => STATS): Calls {
  const calls: Calls = {};
  mockIPC((command, payload) => {
    (calls[command] ??= []).push((payload ?? {}) as Record<string, unknown>);
    if (command === "stats_collect") {
      return statsResult();
    }
    if (command === "stats_todos") {
      return TODOS;
    }
    if (command === "stats_line_author") {
      return AUTHOR;
    }
    return true;
  });
  return calls;
}

function open() {
  renderWithProviders(<StatsDialog repoPath="C:/repo" />);
  act(() => useStatsDialogStore.getState().show());
}

describe("StatsDialog", () => {
  afterEach(() => {
    act(() => useStatsDialogStore.getState().hide());
  });

  it("does nothing until it is opened", () => {
    const calls = serve();
    renderWithProviders(<StatsDialog repoPath="C:/repo" />);
    expect(calls.stats_collect).toBeUndefined();
  });

  it("collects the statistics once opened and draws the activity calendar", async () => {
    const calls = serve();
    open();
    expect(await screen.findByRole("img", { name: t("stats.activity.day", { count: 3, date: TODAY }) })).toBeTruthy();
    expect(calls.stats_collect?.[0]).toMatchObject({ repoPath: "C:/repo", limit: 20000 });
    expect(screen.getByText(t("stats.truncated", { count: 20000 }))).toBeTruthy();
    expect(screen.getByText(t("stats.activity.total", { count: 3 }))).toBeTruthy();
  });

  it("lists contributors and the files that only one person knows", async () => {
    serve();
    open();
    await screen.findByText(t("stats.activity.total", { count: 3 }));
    fireEvent.click(screen.getByRole("tab", { name: t("stats.tabs.contributors") }));
    const list = screen.getByRole("list", { name: t("stats.contributors.listLabel") });
    expect(list.textContent).toContain("ana@example.com");
    expect(list.textContent).toContain("beto@example.com");
    fireEvent.click(screen.getByRole("tab", { name: t("stats.tabs.files") }));
    const bus = screen.getByRole("region", { name: t("stats.files.busTitle") });
    expect(bus.textContent).toContain("2 KB");
  });

  it("lets the user cancel a long analysis", async () => {
    const calls = serve(() => new Promise<RepoStats>(() => undefined));
    open();
    const cancel = await screen.findByRole("button", { name: t("common.cancel") });
    const current = calls.stats_collect?.at(-1)?.jobId;
    const before = calls.job_cancel?.length ?? 0;
    fireEvent.click(cancel);
    await waitFor(() => expect(calls.job_cancel?.length ?? 0).toBe(before + 1));
    expect(calls.job_cancel?.at(-1)).toMatchObject({ jobId: current });
  });

  it("searches pending notes only in its tab and asks for the author on demand", async () => {
    const calls = serve();
    open();
    expect(calls.stats_todos).toBeUndefined();
    fireEvent.click(screen.getByRole("tab", { name: t("stats.tabs.todos") }));
    expect(await screen.findByText("// TODO: write it")).toBeTruthy();
    expect(calls.stats_line_author).toBeUndefined();
    fireEvent.click(screen.getByRole("button", { name: t("stats.todos.whoLabel", { path: "docs/guide.md", line: 2 }) }));
    await waitFor(() => expect(calls.stats_line_author?.[0]).toMatchObject({ path: "docs/guide.md", line: 2 }));
    expect(await screen.findByText(/^Beto · /)).toBeTruthy();
  });
});
