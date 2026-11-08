import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { mockIPC } from "@tauri-apps/api/mocks";
import type { ParseKeys } from "i18next";
import { afterEach, describe, expect, it } from "vitest";
import { i18next } from "@/i18n";
import { renderWithProviders } from "@/test/render";
import type { AbsorbPlan } from "../api";
import { useAbsorbDialogStore } from "../store";
import { AbsorbDialog } from "./absorb-dialog";

const PLAN: AbsorbPlan = {
  assignments: [
    {
      path: "src/a.ts",
      hunk: "@@ -2 +2 @@",
      added: 1,
      removed: 1,
      target: { hash: "a".repeat(40), shortHash: "aaaaaaa", title: "add alpha" },
    },
  ],
  skipped: [{ path: "src/new.ts", hunk: null, reason: "unsupported" }],
};

type Calls = Record<string, Array<Record<string, unknown>>>;

function serve(plan: AbsorbPlan): Calls {
  const calls: Calls = {};
  mockIPC((command, payload) => {
    (calls[command] ??= []).push((payload ?? {}) as Record<string, unknown>);
    if (command === "absorb_preview") {
      return plan;
    }
    if (command === "absorb_run") {
      return { fixups: 1, squashed: true };
    }
    return null;
  });
  return calls;
}

const t = (key: ParseKeys, options?: Record<string, unknown>) => i18next.t(key, options);

function open() {
  renderWithProviders(<AbsorbDialog repoPath="C:/repo" />);
  act(() => useAbsorbDialogStore.getState().show());
}

describe("AbsorbDialog", () => {
  afterEach(() => {
    act(() => useAbsorbDialogStore.getState().hide());
  });

  it("shows where each block goes and what stays", async () => {
    serve(PLAN);
    open();
    expect(await screen.findByText(t("absorb.goesTo", { hash: "aaaaaaa", title: "add alpha" }))).toBeTruthy();
    expect(screen.getByText(t("absorb.reasons.unsupported"), { exact: false })).toBeTruthy();
  });

  it("creates the fixups and folds them", async () => {
    const calls = serve(PLAN);
    open();
    const button = await screen.findByRole<HTMLButtonElement>("button", { name: t("absorb.applyAndSquash") });
    await waitFor(() => expect(button.disabled).toBe(false));
    fireEvent.click(button);
    await waitFor(() => expect(calls.absorb_run?.[0]).toMatchObject({ path: "C:/repo", squash: true }));
  });

  it("can create only the fixups", async () => {
    const calls = serve(PLAN);
    open();
    const button = await screen.findByRole<HTMLButtonElement>("button", { name: t("absorb.onlyFixups") });
    await waitFor(() => expect(button.disabled).toBe(false));
    fireEvent.click(button);
    await waitFor(() => expect(calls.absorb_run?.[0]).toMatchObject({ squash: false }));
  });

  it("disables both buttons when nothing can be absorbed", async () => {
    serve({ assignments: [], skipped: [{ path: "x", hunk: "@@ -0,0 +1 @@", reason: "onlyAdditions" }] });
    open();
    expect(await screen.findByText(t("absorb.nothingToAbsorb"))).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>("button", { name: t("absorb.applyAndSquash") }).disabled).toBe(true);
  });

  it("explains when nothing is staged", async () => {
    serve({ assignments: [], skipped: [] });
    open();
    expect(await screen.findByText(t("absorb.empty.title"))).toBeTruthy();
  });
});
