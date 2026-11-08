import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { mockIPC } from "@tauri-apps/api/mocks";
import type { ParseKeys } from "i18next";
import { afterEach, describe, expect, it } from "vitest";
import { i18next } from "@/i18n";
import type { BisectState } from "@/shared/types/git";
import { renderWithProviders } from "@/test/render";
import { useBisectDialogStore } from "../store";
import type { BisectPreset } from "../store";
import { BisectDialog } from "./bisect-dialog";

const REPO = "C:/work/app";

const STARTED: BisectState = {
  active: true,
  steps: [],
  currentHash: "abc1234",
  currentTitle: "middle",
  remaining: 4,
  estimatedSteps: 2,
  culprit: null,
  startRef: "main",
};

interface Started {
  path: string;
  bad: string;
  good: string;
}

function serve(started: Started[], failure?: { kind: string; detail: string }) {
  mockIPC((command, payload) => {
    if (command === "bisect_start") {
      started.push(payload as unknown as Started);
      if (failure) {
        throw Object.assign(new Error(failure.detail), {
          kind: failure.kind,
          suggestedAction: null,
          detail: failure.detail,
        });
      }
      return STARTED;
    }
    return null;
  });
}

const t = (key: ParseKeys) => i18next.t(key);

function open(preset?: BisectPreset) {
  renderWithProviders(<BisectDialog repoPath={REPO} />);
  act(() => useBisectDialogStore.getState().show(preset));
}

describe("BisectDialog", () => {
  afterEach(() => {
    act(() => useBisectDialogStore.getState().hide());
  });

  it("proposes HEAD as the bad commit and waits for a good one", async () => {
    serve([]);
    open();
    const bad = await screen.findByLabelText<HTMLInputElement>(t("bisect.dialog.bad"));
    expect(bad.value).toBe("HEAD");
    const submit = screen.getByRole<HTMLButtonElement>("button", { name: t("bisect.dialog.submit") });
    expect(submit.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(t("bisect.dialog.good")), { target: { value: "  v1.2.0 " } });
    expect(submit.disabled).toBe(false);
  });

  it("starts the search with trimmed values and closes", async () => {
    const started: Started[] = [];
    serve(started);
    open();
    fireEvent.change(await screen.findByLabelText(t("bisect.dialog.good")), { target: { value: "  v1.2.0 " } });
    fireEvent.click(screen.getByRole("button", { name: t("bisect.dialog.submit") }));
    await waitFor(() => expect(started).toHaveLength(1));
    expect(started[0]).toEqual({ path: REPO, bad: "HEAD", good: "v1.2.0" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("starts from the commit chosen in the history menu", async () => {
    const started: Started[] = [];
    serve(started);
    open({ good: "3f9a1c2" });
    const good = await screen.findByLabelText<HTMLInputElement>(t("bisect.dialog.good"));
    expect(good.value).toBe("3f9a1c2");
    fireEvent.click(screen.getByRole("button", { name: t("bisect.dialog.submit") }));
    await waitFor(() => expect(started).toHaveLength(1));
    expect(started[0]).toEqual({ path: REPO, bad: "HEAD", good: "3f9a1c2" });
  });

  it("stays open when git refuses the range", async () => {
    const started: Started[] = [];
    serve(started, { kind: "localChangesWouldBeOverwritten", detail: "bisect needs a clean working tree" });
    open({ bad: "abc1234", good: "def5678" });
    fireEvent.click(await screen.findByRole("button", { name: t("bisect.dialog.submit") }));
    await waitFor(() => expect(started).toHaveLength(1));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});
