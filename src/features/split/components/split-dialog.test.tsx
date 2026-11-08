import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { mockIPC } from "@tauri-apps/api/mocks";
import type { ParseKeys } from "i18next";
import { afterEach, describe, expect, it } from "vitest";
import { i18next } from "@/i18n";
import { renderWithProviders } from "@/test/render";
import { useSplitDialogStore } from "../store";
import { SplitDialog } from "./split-dialog";

type Calls = Record<string, Array<Record<string, unknown>>>;

function serve(): Calls {
  const calls: Calls = {};
  mockIPC((command, payload) => {
    (calls[command] ??= []).push((payload ?? {}) as Record<string, unknown>);
    return command === "split_commit_files" ? ["a.txt", "b.txt", "c.txt"] : null;
  });
  return calls;
}

const t = (key: ParseKeys, options?: Record<string, unknown>) => i18next.t(key, options);

function open() {
  renderWithProviders(<SplitDialog repoPath="C:/repo" />);
  act(() => useSplitDialogStore.getState().show({ hash: "a".repeat(40), shortHash: "aaaaaaa", title: "big commit" }));
}

describe("SplitDialog", () => {
  afterEach(() => {
    act(() => useSplitDialogStore.getState().hide());
  });

  it("needs some but not all of the files before it can split", async () => {
    serve();
    open();
    const run = await screen.findByRole<HTMLButtonElement>("button", { name: t("split.run") });
    expect(run.disabled).toBe(true);
    for (const name of ["a.txt", "b.txt", "c.txt"]) {
      fireEvent.click(screen.getByRole("checkbox", { name }));
    }
    expect(run.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: "c.txt" }));
    await waitFor(() => expect(run.disabled).toBe(false));
  });

  it("sends the chosen files and both messages", async () => {
    const calls = serve();
    open();
    fireEvent.click(await screen.findByRole("checkbox", { name: "b.txt" }));
    fireEvent.change(screen.getByLabelText(t("split.firstMessage")), { target: { value: "only b" } });
    fireEvent.change(screen.getByLabelText(t("split.secondMessage")), { target: { value: "everything else" } });
    fireEvent.click(screen.getByRole("button", { name: t("split.run") }));
    await waitFor(() =>
      expect(calls.split_commit_run?.[0]).toMatchObject({
        hash: "a".repeat(40),
        firstPaths: ["b.txt"],
        firstMessage: "only b",
        secondMessage: "everything else",
      }),
    );
  });
});
