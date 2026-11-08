import { fireEvent, screen, waitFor } from "@testing-library/react";
import { mockIPC } from "@tauri-apps/api/mocks";
import type { ParseKeys } from "i18next";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { i18next } from "@/i18n";
import { renderWithProviders } from "@/test/render";
import { useRepositoriesStore } from "../store";
import { CloneRepositoryDialog } from "./clone-repository-dialog";

type Calls = Record<string, Array<Record<string, unknown>>>;

const t = (key: ParseKeys, options?: Record<string, unknown>) => i18next.t(key, options);

function serve(): Calls {
  const calls: Calls = {};
  mockIPC((command, payload) => {
    (calls[command] ??= []).push((payload ?? {}) as Record<string, unknown>);
    if (command === "github_accounts_list") {
      return [];
    }
    if (command === "repo_clone") {
      return { path: "C:/work/demo", name: "demo" };
    }
    return null;
  });
  return calls;
}

function fill() {
  renderWithProviders(<CloneRepositoryDialog open preset={null} onClose={() => undefined} />);
  fireEvent.change(screen.getByLabelText(t("repositories.clone.url")), { target: { value: "https://example.com/team/demo.git" } });
}

describe("CloneRepositoryDialog", () => {
  beforeEach(() => {
    useRepositoriesStore.setState({ lastParentDirectory: "C:/work" });
  });

  afterEach(() => {
    useRepositoriesStore.setState({ lastParentDirectory: null });
  });

  it("clones the full history by default", async () => {
    const calls = serve();
    fill();
    fireEvent.click(screen.getByRole("button", { name: t("repositories.clone.submit") }));
    await waitFor(() => expect(calls.repo_clone?.[0]).toMatchObject({ options: { depth: null, blobless: false } }));
  });

  it("sends the depth and the blob filter when they are chosen", async () => {
    const calls = serve();
    fill();
    fireEvent.click(screen.getByRole("checkbox", { name: t("repositories.clone.shallow") }));
    fireEvent.change(screen.getByLabelText(t("repositories.clone.depth")), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("checkbox", { name: t("repositories.clone.blobless") }));
    fireEvent.click(screen.getByRole("button", { name: t("repositories.clone.submit") }));
    await waitFor(() => expect(calls.repo_clone?.[0]).toMatchObject({ options: { depth: 5, blobless: true } }));
  });

  it("does not allow an invalid depth", () => {
    serve();
    fill();
    fireEvent.click(screen.getByRole("checkbox", { name: t("repositories.clone.shallow") }));
    fireEvent.change(screen.getByLabelText(t("repositories.clone.depth")), { target: { value: "0" } });
    expect(screen.getByRole<HTMLButtonElement>("button", { name: t("repositories.clone.submit") }).disabled).toBe(true);
    expect(screen.getByText(t("repositories.clone.depthInvalid"))).toBeTruthy();
  });
});
