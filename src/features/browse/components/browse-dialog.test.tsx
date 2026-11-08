import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { mockIPC } from "@tauri-apps/api/mocks";
import type { ParseKeys } from "i18next";
import { afterEach, describe, expect, it } from "vitest";
import { i18next } from "@/i18n";
import { renderWithProviders } from "@/test/render";
import type { FileContent, TreeListing } from "../api";
import { useBrowseDialogStore } from "../store";
import { BrowseDialog } from "./browse-dialog";

const COMMIT = "c".repeat(40);

const TREES: Record<string, TreeListing> = {
  root: {
    commit: COMMIT,
    folder: "",
    entries: [
      { name: "src", path: "src", kind: "folder", mode: "040000", size: null },
      { name: "README.md", path: "README.md", kind: "file", mode: "100644", size: 6 },
    ],
  },
  src: {
    commit: COMMIT,
    folder: "src",
    entries: [{ name: "main.rs", path: "src/main.rs", kind: "file", mode: "100644", size: 13 }],
  },
};

type Calls = Record<string, Array<Record<string, unknown>>>;

function serve(): Calls {
  const calls: Calls = {};
  mockIPC((command, payload) => {
    const args = (payload ?? {}) as Record<string, unknown>;
    (calls[command] ??= []).push(args);
    if (command === "browse_tree") {
      return args.folder === "src" ? TREES.src : TREES.root;
    }
    if (command === "browse_read_file") {
      const content: FileContent = {
        path: String(args.filePath),
        exists: true,
        size: 13,
        binary: false,
        tooLarge: false,
        text: "fn main() {}\nsecond line\n",
        imageBase64: null,
      };
      return content;
    }
    return null;
  });
  return calls;
}

const t = (key: ParseKeys, options?: Record<string, unknown>) => i18next.t(key, options);

function open() {
  renderWithProviders(<BrowseDialog repoPath="C:/repo" />);
  act(() => useBrowseDialogStore.getState().show({ revision: COMMIT, label: "ccccccc" }));
}

describe("BrowseDialog", () => {
  afterEach(() => {
    act(() => useBrowseDialogStore.getState().hide());
  });

  it("opens folders lazily and shows a file read-only", async () => {
    const calls = serve();
    open();
    expect(await screen.findByText(t("browse.title", { revision: "ccccccc" }))).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: /^src$/ }));
    await waitFor(() => expect(calls.browse_tree?.[1]).toMatchObject({ revision: COMMIT, folder: "src" }));
    fireEvent.click(await screen.findByRole("button", { name: /^main\.rs$/ }));
    expect(await screen.findByRole("list", { name: t("browse.contentLabel", { path: "src/main.rs" }) })).toBeTruthy();
    expect(calls.browse_read_file?.[0]).toMatchObject({
      source: { kind: "revision", revision: COMMIT },
      filePath: "src/main.rs",
    });
  });

  it("asks before restoring the file and then restores it", async () => {
    const calls = serve();
    open();
    fireEvent.click(await screen.findByRole("button", { name: /^README\.md$/ }));
    await screen.findByRole("list", { name: t("browse.contentLabel", { path: "README.md" }) });
    fireEvent.click(screen.getByRole("button", { name: t("browse.restore") }));
    expect(calls.browse_restore_file).toBeUndefined();
    fireEvent.click(screen.getByRole("button", { name: t("browse.restoreConfirm.confirm") }));
    await waitFor(() =>
      expect(calls.browse_restore_file?.[0]).toMatchObject({ path: "C:/repo", revision: COMMIT, filePath: "README.md" }),
    );
  });
});
