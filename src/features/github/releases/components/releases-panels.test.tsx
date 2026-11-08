import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { mockIPC } from "@tauri-apps/api/mocks";
import type { ParseKeys } from "i18next";
import { afterEach, describe, expect, it } from "vitest";
import { i18next } from "@/i18n";
import { renderWithProviders } from "@/test/render";
import type { Release } from "../releases-model";
import { useReleaseStore } from "../store";
import { ReleaseDetailPanel, ReleasesPanel } from "./releases-panels";

const REPO = "C:/work/app";
const REMOTE = { remoteName: "origin", url: "https://github.com/acme/app.git", host: "github.com", owner: "acme", name: "app" };
const ACCOUNT = { id: "github.com:octo", host: "github.com", login: "octo", name: "Octo", avatarUrl: "", source: "oauth", userId: 1 };

function release(overrides: Partial<Release> = {}): Release {
  return {
    id: 7,
    tagName: "v1.0.0",
    name: "First stable",
    body: "These are the notes",
    draft: false,
    prerelease: false,
    targetCommitish: "main",
    createdAt: "2026-01-01T00:00:00Z",
    publishedAt: "2026-01-02T00:00:00Z",
    htmlUrl: "https://github.com/acme/app/releases/tag/v1.0.0",
    author: { login: "octo" },
    assets: [{ id: 3, name: "app.zip", size: 2048, downloadCount: 5, contentType: "application/zip", browserDownloadUrl: "https://x/app.zip" }],
    ...overrides,
  };
}

type Calls = Record<string, Array<Record<string, unknown>>>;

function serve(releases: Release[], options: { pickedFiles?: string[] } = {}): Calls {
  const calls: Calls = {};
  mockIPC((command, payload) => {
    const args = (payload ?? {}) as Record<string, unknown>;
    (calls[command] ??= []).push(args);
    switch (command) {
      case "github_accounts_list":
        return [ACCOUNT];
      case "github_repo_remotes":
        return [REMOTE];
      case "github_releases_list":
        return { items: releases, nextPage: null };
      case "tag_list":
        return [
          { name: "v1.0.0", targetHash: "a", annotated: false, message: null, tagger: null, time: 10 },
          { name: "v1.1.0", targetHash: "b", annotated: false, message: null, tagger: null, time: 20 },
        ];
      case "github_release_notes":
        return { name: "v1.2.0", body: "## What's changed\n* A fix" };
      case "github_release_create":
        return release({ id: 9, tagName: (args.request as { tagName: string }).tagName });
      case "plugin:dialog|open":
        return options.pickedFiles ?? [];
      case "github_release_asset_upload":
        return { id: 11, name: "notes.txt", size: 1, downloadCount: 0, contentType: "text/plain", browserDownloadUrl: "" };
      default:
        return null;
    }
  });
  return calls;
}

const t = (key: ParseKeys, options?: Record<string, unknown>) => i18next.t(key, options);

function open() {
  return renderWithProviders(
    <>
      <ReleasesPanel repoPath={REPO} />
      <ReleaseDetailPanel repoPath={REPO} />
    </>,
  );
}

async function lastCall(calls: Calls, command: string): Promise<Record<string, unknown>> {
  await waitFor(() => expect(calls[command]?.length ?? 0).toBeGreaterThan(0));
  const list = calls[command] ?? [];
  return list[list.length - 1] ?? {};
}

describe("releases", () => {
  afterEach(() => {
    act(() => {
      useReleaseStore.getState().select(null);
      useReleaseStore.getState().stopCreating();
    });
  });

  it("lists releases with their state and shows the details of the selected one", async () => {
    serve([release(), release({ id: 8, tagName: "v1.1.0-rc1", name: null, draft: true })]);
    open();
    expect(await screen.findByText("First stable")).toBeTruthy();
    expect(screen.getByText(t("github.releases.status.draft"))).toBeTruthy();
    expect(screen.getByText(t("github.releases.nothingSelected"))).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /First stable/ }));
    expect(await screen.findByText("These are the notes")).toBeTruthy();
    expect(screen.getByText("app.zip")).toBeTruthy();
    expect(screen.getByText(/2 KB/)).toBeTruthy();
  });

  it("publishes a draft", async () => {
    const calls = serve([release({ id: 8, tagName: "v2.0.0", draft: true })]);
    open();
    fireEvent.click(await screen.findByRole("button", { name: /v2\.0\.0/ }));
    fireEvent.click(await screen.findByRole("button", { name: t("github.releases.publishDraft") }));
    expect(await lastCall(calls, "github_release_update")).toMatchObject({ id: 8, edit: { draft: false } });
  });

  it("creates a release after checking the tag and lets GitHub write the notes", async () => {
    const calls = serve([]);
    open();
    fireEvent.click(await screen.findByRole("button", { name: t("github.releases.new") }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: t("github.releases.publish") }));
    expect(await within(dialog).findByText(t("github.releases.tagProblems.empty"))).toBeTruthy();
    expect(calls.github_release_create).toBeUndefined();

    fireEvent.change(within(dialog).getByLabelText(t("github.releases.tag")), { target: { value: "v1.2.0" } });
    fireEvent.click(within(dialog).getByRole("button", { name: t("github.releases.generate") }));
    await waitFor(() => expect(within(dialog).getByLabelText<HTMLTextAreaElement>(t("github.releases.notes")).value).toContain("A fix"));
    expect(within(dialog).getByLabelText<HTMLInputElement>(t("github.releases.title")).value).toBe("v1.2.0");
    expect(await lastCall(calls, "github_release_notes")).toMatchObject({ tag: "v1.2.0", previousTag: "v1.1.0", target: null });

    fireEvent.click(within(dialog).getByLabelText(t("github.releases.prerelease")));
    fireEvent.click(within(dialog).getByRole("button", { name: t("github.releases.publish") }));
    expect(await lastCall(calls, "github_release_create")).toMatchObject({
      request: { tagName: "v1.2.0", target: null, name: "v1.2.0", draft: false, prerelease: true },
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("deletes a release only after confirming and removes an attached file", async () => {
    const calls = serve([release()]);
    open();
    fireEvent.click(await screen.findByRole("button", { name: /First stable/ }));
    fireEvent.click(await screen.findByRole("button", { name: t("github.releases.deleteAsset", { name: "app.zip" }) }));
    expect(await lastCall(calls, "github_release_asset_delete")).toMatchObject({ id: 3 });

    fireEvent.click(screen.getByRole("button", { name: t("github.releases.delete") }));
    const dialog = await screen.findByRole("dialog");
    expect(calls.github_release_delete).toBeUndefined();
    fireEvent.click(within(dialog).getByRole("button", { name: t("github.releases.delete") }));
    expect(await lastCall(calls, "github_release_delete")).toMatchObject({ id: 7 });
  });

  it("uploads every file that was chosen", async () => {
    const calls = serve([release()], { pickedFiles: ["C:/dist/a.zip", "C:/dist/b.zip"] });
    open();
    fireEvent.click(await screen.findByRole("button", { name: /First stable/ }));
    fireEvent.click(await screen.findByRole("button", { name: t("github.releases.attach") }));
    await waitFor(() => expect(calls.github_release_asset_upload).toHaveLength(2));
    expect(calls.github_release_asset_upload?.map((call) => call.file)).toEqual(["C:/dist/a.zip", "C:/dist/b.zip"]);
    expect(calls.github_release_asset_upload?.[0]).toMatchObject({ releaseId: 7 });
  });

  it("says so when there are no releases", async () => {
    serve([]);
    open();
    expect(await screen.findByText(t("github.releases.empty.title"))).toBeTruthy();
  });
});
