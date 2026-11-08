import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { mockIPC } from "@tauri-apps/api/mocks";
import type { ParseKeys } from "i18next";
import { afterEach, describe, expect, it } from "vitest";
import { i18next } from "@/i18n";
import { renderWithProviders } from "@/test/render";
import type { StackNode } from "../api";
import { useStackDialogStore } from "../store";
import { StackDialog } from "./stack-dialog";

const BRANCHES = ["main", "a", "b"].map((name) => ({
  name,
  fullName: `refs/heads/${name}`,
  isRemote: false,
  isCurrent: name === "b",
  upstream: null,
  ahead: 0,
  behind: 0,
  upstreamGone: false,
}));

const NODES: StackNode[] = [
  { name: "main", parent: null, depth: 0, ahead: 0, needsRestack: false, isCurrent: false },
  { name: "a", parent: "main", depth: 1, ahead: 2, needsRestack: true, isCurrent: false },
  { name: "b", parent: "a", depth: 2, ahead: 1, needsRestack: false, isCurrent: true },
];

type Calls = Record<string, Array<Record<string, unknown>>>;

function serve(nodes: StackNode[]): Calls {
  const calls: Calls = {};
  mockIPC((command, payload) => {
    (calls[command] ??= []).push((payload ?? {}) as Record<string, unknown>);
    switch (command) {
      case "stack_list":
        return nodes;
      case "branch_list":
        return BRANCHES;
      case "stack_restack":
        return { restacked: ["a", "b"] };
      default:
        return null;
    }
  });
  return calls;
}

const t = (key: ParseKeys, options?: Record<string, unknown>) => i18next.t(key, options);

function open() {
  renderWithProviders(<StackDialog repoPath="C:/repo" />);
  act(() => useStackDialogStore.getState().show());
}

describe("StackDialog", () => {
  afterEach(() => {
    act(() => useStackDialogStore.getState().hide());
  });

  it("lists the chain and marks the branches that need a restack", async () => {
    serve(NODES);
    open();
    expect(await screen.findByText(t("stack.needsRestack"))).toBeTruthy();
    expect(screen.getAllByText("main").length).toBeGreaterThan(0);
    expect(screen.getByText(t("stack.current"))).toBeTruthy();
  });

  it("restacks the whole chain", async () => {
    const calls = serve(NODES);
    open();
    const button = await screen.findByRole<HTMLButtonElement>("button", { name: t("stack.restack") });
    await waitFor(() => expect(button.disabled).toBe(false));
    fireEvent.click(button);
    await waitFor(() => expect(calls.stack_restack?.length).toBe(1));
  });

  it("keeps the restack button off when nothing is stale", async () => {
    serve(NODES.map((node) => ({ ...node, needsRestack: false })));
    open();
    const button = await screen.findByRole<HTMLButtonElement>("button", { name: t("stack.restack") });
    expect(button.disabled).toBe(true);
  });

  it("puts a branch under another and removes it again", async () => {
    const calls = serve([]);
    open();
    expect(await screen.findByText(t("stack.empty.title"))).toBeTruthy();
    await waitFor(() => expect(screen.getByLabelText<HTMLSelectElement>(t("stack.branch")).options.length).toBeGreaterThan(1));
    fireEvent.change(screen.getByLabelText(t("stack.branch")), { target: { value: "a" } });
    fireEvent.change(screen.getByLabelText(t("stack.parent")), { target: { value: "main" } });
    fireEvent.click(screen.getByRole("button", { name: t("stack.place") }));
    await waitFor(() => expect(calls.stack_set_parent?.[0]).toMatchObject({ branch: "a", parent: "main" }));
  });

  it("removes a branch from the stack", async () => {
    const calls = serve(NODES);
    open();
    fireEvent.click(await screen.findByRole("button", { name: t("stack.remove", { name: "a" }) }));
    await waitFor(() => expect(calls.stack_set_parent?.[0]).toMatchObject({ branch: "a", parent: null }));
  });
});
