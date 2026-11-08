import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { mockIPC } from "@tauri-apps/api/mocks";
import type { ParseKeys } from "i18next";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useRepositoriesStore } from "@/features/repositories/store";
import { useSettingsStore } from "@/features/settings/store";
import { i18next } from "@/i18n";
import { renderWithProviders } from "@/test/render";
import type { RepoOutcome, RepoRow } from "../api";
import { useOverviewDialogStore } from "../store";
import { OverviewDialog } from "./overview-dialog";

type Calls = Record<string, Array<Record<string, unknown>>>;

const ROWS: RepoRow[] = [
  { path: "C:/work/alpha", available: true, branch: "main", upstream: "origin/main", changes: 2, ahead: 1, behind: 3 },
  { path: "C:/work/beta", available: false, branch: null, upstream: null, changes: 0, ahead: 0, behind: 0 },
];

function serve(outcomes: RepoOutcome[] = []): Calls {
  const calls: Calls = {};
  mockIPC((command, payload) => {
    (calls[command] ??= []).push((payload ?? {}) as Record<string, unknown>);
    if (command === "multi_status") {
      return ROWS;
    }
    if (command === "multi_fetch" || command === "multi_pull") {
      return outcomes;
    }
    return null;
  });
  return calls;
}

const t = (key: ParseKeys, options?: Record<string, unknown>) => i18next.t(key, options);

function open() {
  renderWithProviders(<OverviewDialog />);
  act(() => useOverviewDialogStore.getState().show());
}

describe("OverviewDialog", () => {
  beforeEach(() => {
    useRepositoriesStore.setState({
      recents: [
        { path: "C:/work/alpha", name: "alpha", lastOpened: 2 },
        { path: "C:/work/beta", name: "beta", lastOpened: 1 },
      ],
    });
    useSettingsStore.setState({ repoGroups: {} });
  });

  afterEach(() => {
    act(() => useOverviewDialogStore.getState().hide());
    useRepositoriesStore.setState({ recents: [] });
  });

  it("shows each repository with its branch, changes and distance to the remote", async () => {
    serve();
    open();
    expect(await screen.findByText(/main · 2 cambios · ↑1 · ↓3/)).toBeTruthy();
    expect(screen.getByText(t("overview.unavailable"))).toBeTruthy();
  });

  it("runs a safe pull over the visible repositories and lists the outcome", async () => {
    const calls = serve([
      { path: "C:/work/alpha", state: "updated", detail: null },
      { path: "C:/work/beta", state: "skipped", detail: "missing" },
    ]);
    open();
    const button = await screen.findByRole<HTMLButtonElement>("button", { name: t("overview.pullAll") });
    await waitFor(() => expect(button.disabled).toBe(false));
    fireEvent.click(button);
    await waitFor(() => expect(calls.multi_pull?.[0]).toMatchObject({ paths: ["C:/work/alpha", "C:/work/beta"] }));
    expect(await screen.findByText(`${t("overview.outcome.skipped")} (missing)`)).toBeTruthy();
  });

  it("filters by group and fetches only those repositories", async () => {
    useSettingsStore.setState({ repoGroups: { "C:/work/alpha": "trabajo" } });
    const calls = serve();
    open();
    const select = await screen.findByLabelText<HTMLSelectElement>(t("overview.filter"));
    fireEvent.change(select, { target: { value: "trabajo" } });
    const fetchButton = await screen.findByRole<HTMLButtonElement>("button", { name: t("overview.fetchAll") });
    await waitFor(() => expect(fetchButton.disabled).toBe(false));
    fireEvent.click(fetchButton);
    await waitFor(() => expect(calls.multi_fetch?.[0]).toMatchObject({ paths: ["C:/work/alpha"] }));
  });

  it("saves the group typed for a repository", async () => {
    serve();
    open();
    const fields = await screen.findAllByLabelText(t("overview.group"));
    fireEvent.change(fields[0] as HTMLElement, { target: { value: "personal" } });
    expect(useSettingsStore.getState().repoGroups["C:/work/alpha"]).toBe("personal");
  });
});
