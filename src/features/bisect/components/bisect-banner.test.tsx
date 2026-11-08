import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { mockIPC } from "@tauri-apps/api/mocks";
import type { ParseKeys } from "i18next";
import { afterEach, describe, expect, it } from "vitest";
import { i18next } from "@/i18n";
import { useHistoryStore } from "@/features/history/store";
import { useUiStore } from "@/shared/lib/ui-store";
import type { BisectState, BisectVerdict } from "@/shared/types/git";
import { renderWithProviders } from "@/test/render";
import { BisectBanner } from "./bisect-banner";

const REPO = "C:/work/app";
const CULPRIT_HASH = "9c5cde827503e21f1667f8a056dd87c451534031";

function state(overrides: Partial<BisectState> = {}): BisectState {
  return {
    active: true,
    steps: [
      { verdict: "bad", hash: "8f4c49f", title: "commit 15" },
      { verdict: "good", hash: "1811e2a", title: "commit 0" },
    ],
    currentHash: "b66997d2420010929c6ce95732b7b37ecbb3ad19",
    currentTitle: "commit 7",
    remaining: 6,
    estimatedSteps: 3,
    culprit: null,
    startRef: "main",
    ...overrides,
  };
}

interface Marked {
  path: string;
  verdict: BisectVerdict;
  revision: string | null;
}

interface Calls {
  marked: Marked[];
  finished: string[];
}

function serve(current: BisectState, calls: Calls) {
  mockIPC((command, payload) => {
    if (command === "bisect_state_get") {
      return current;
    }
    if (command === "bisect_mark") {
      calls.marked.push(payload as unknown as Marked);
      return current;
    }
    if (command === "bisect_finish") {
      calls.finished.push((payload as { path: string }).path);
      return null;
    }
    return null;
  });
}

const t = (key: ParseKeys, options?: Record<string, unknown>) => i18next.t(key, options);

describe("BisectBanner", () => {
  afterEach(() => {
    act(() => {
      useHistoryStore.getState().reset();
      useUiStore.getState().setTab("changes");
    });
  });

  it("renders nothing when no bisect is running", async () => {
    serve(state({ active: false, steps: [], currentHash: null, currentTitle: null }), { marked: [], finished: [] });
    const { container } = renderWithProviders(<BisectBanner repoPath={REPO} />);
    await waitFor(() => expect(container.querySelector("[role=status]")).toBeNull());
    expect(screen.queryByText(t("bisect.banner.title"))).toBeNull();
  });

  it("shows the commit under test and how much work is left", async () => {
    serve(state(), { marked: [], finished: [] });
    renderWithProviders(<BisectBanner repoPath={REPO} />);
    expect(await screen.findByText(t("bisect.banner.title"))).toBeTruthy();
    expect(screen.getByText("b66997d")).toBeTruthy();
    expect(screen.getByText(t("bisect.banner.progress", { steps: 3, count: 6 }))).toBeTruthy();
  });

  it("asks for a good and a bad commit while one of them is missing", async () => {
    serve(state({ steps: [{ verdict: "bad", hash: "8f4c49f", title: "commit 15" }], remaining: null, estimatedSteps: null }), {
      marked: [],
      finished: [],
    });
    renderWithProviders(<BisectBanner repoPath={REPO} />);
    expect(await screen.findByText(t("bisect.banner.needMarks"))).toBeTruthy();
  });

  it("marks the commit under test as good, bad or skipped", async () => {
    const calls: Calls = { marked: [], finished: [] };
    serve(state(), calls);
    renderWithProviders(<BisectBanner repoPath={REPO} />);
    fireEvent.click(await screen.findByRole("button", { name: t("bisect.banner.bad") }));
    await waitFor(() => expect(calls.marked).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: t("bisect.banner.good") }));
    await waitFor(() => expect(calls.marked).toHaveLength(2));
    fireEvent.click(screen.getByRole("button", { name: t("bisect.banner.skip") }));
    await waitFor(() => expect(calls.marked).toHaveLength(3));
    expect(calls.marked.map((entry) => entry.verdict)).toEqual(["bad", "good", "skip"]);
    expect(calls.marked.every((entry) => entry.path === REPO && entry.revision === null)).toBe(true);
  });

  it("finishes the search from the banner", async () => {
    const calls: Calls = { marked: [], finished: [] };
    serve(state(), calls);
    renderWithProviders(<BisectBanner repoPath={REPO} />);
    fireEvent.click(await screen.findByRole("button", { name: t("bisect.banner.finish") }));
    await waitFor(() => expect(calls.finished).toEqual([REPO]));
  });

  it("names the culprit and jumps to it in the history", async () => {
    const calls: Calls = { marked: [], finished: [] };
    serve(state({ culprit: { hash: CULPRIT_HASH, title: "Break the login" }, remaining: null, estimatedSteps: null }), calls);
    renderWithProviders(<BisectBanner repoPath={REPO} />);
    expect(await screen.findByText(t("bisect.banner.foundTitle"))).toBeTruthy();
    expect(screen.getByText("9c5cde8")).toBeTruthy();
    expect(screen.getByText(/Break the login/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: t("bisect.banner.bad") })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: t("bisect.banner.showInHistory") }));
    expect(useUiStore.getState().tab).toBe("history");
    expect(useHistoryStore.getState().selectedHash).toBe(CULPRIT_HASH);

    fireEvent.click(screen.getByRole("button", { name: t("bisect.banner.finishTo", { ref: "main" }) }));
    await waitFor(() => expect(calls.finished).toEqual([REPO]));
  });
});
