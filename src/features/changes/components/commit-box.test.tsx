import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { mockIPC } from "@tauri-apps/api/mocks";
import type { ParseKeys } from "i18next";
import { afterEach, describe, expect, it } from "vitest";
import { useSettingsStore } from "@/features/settings/store";
import { i18next } from "@/i18n";
import { renderWithProviders } from "@/test/render";
import { useChangesStore } from "../store";
import { CommitBox } from "./commit-box";

type Calls = Record<string, Array<Record<string, unknown>>>;

const t = (key: ParseKeys, options?: Record<string, unknown>) => i18next.t(key, options);

function serve(template = ""): Calls {
  const calls: Calls = {};
  mockIPC((command, payload) => {
    (calls[command] ??= []).push((payload ?? {}) as Record<string, unknown>);
    switch (command) {
      case "commit_coauthors":
        return [{ name: "Ana", email: "ana@example.com", commits: 3 }];
      case "commit_template_get":
        return template;
      case "guard_scan":
        return [];
      case "commit_create":
        return "abc";
      default:
        return null;
    }
  });
  return calls;
}

function renderBox(branch = "feature/42-login") {
  renderWithProviders(<CommitBox repoPath="C:/repo" branchName={branch} stagedCount={1} conflictCount={0} />);
}

describe("the commit box extras", () => {
  afterEach(() => {
    act(() => {
      useChangesStore.getState().reset();
      useSettingsStore.setState({ issuePrefixMode: "off" });
    });
  });

  it("adds the chosen co-authors as trailers when committing", async () => {
    const calls = serve();
    renderBox();
    fireEvent.change(screen.getByLabelText(t("commit.titleLabel")), { target: { value: "Fix login" } });
    fireEvent.change(screen.getByLabelText(t("commit.descriptionLabel")), { target: { value: "Body" } });
    fireEvent.click(screen.getByRole("button", { name: t("commit.coauthors.label") }));
    fireEvent.click(await screen.findByRole("checkbox", { name: /Ana/ }));
    expect(screen.getByRole("button", { name: t("commit.coauthors.count", { count: 1 }) })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Hacer commit|^Commit/ }));
    await waitFor(() =>
      expect(calls.commit_create?.[0]).toMatchObject({
        title: "Fix login",
        description: "Body\n\nCo-authored-by: Ana <ana@example.com>",
      }),
    );
  });

  it("fills an empty description with the repository template", async () => {
    serve("Why:\nHow:");
    renderBox();
    await waitFor(() =>
      expect(screen.getByLabelText<HTMLTextAreaElement>(t("commit.descriptionLabel")).value).toBe("Why:\nHow:"),
    );
  });

  it("saves the template from its dialog", async () => {
    const calls = serve();
    renderBox();
    fireEvent.click(screen.getByRole("button", { name: t("commit.template.open") }));
    fireEvent.change(await screen.findByLabelText(t("commit.template.field")), { target: { value: "Refs:" } });
    fireEvent.click(screen.getByRole("button", { name: t("commit.template.save") }));
    await waitFor(() => expect(calls.commit_template_set?.[0]).toMatchObject({ path: "C:/repo", template: "Refs:" }));
  });

  it("offers the issue number only when the setting is on", async () => {
    serve();
    renderBox();
    expect(screen.queryByRole("button", { name: t("commit.issue.addTitle", { issue: 42 }) })).toBeNull();
    await act(async () => {
      useSettingsStore.setState({ issuePrefixMode: "title" });
      await Promise.resolve();
    });
    fireEvent.change(screen.getByLabelText(t("commit.titleLabel")), { target: { value: "Fix login" } });
    fireEvent.click(screen.getByRole("button", { name: t("commit.issue.addTitle", { issue: 42 }) }));
    expect(screen.getByLabelText<HTMLInputElement>(t("commit.titleLabel")).value).toBe("#42: Fix login");
  });

  it("adds a reference line with Alt+I", () => {
    serve();
    useSettingsStore.setState({ issuePrefixMode: "refs" });
    renderBox("fix-7");
    const description = screen.getByLabelText<HTMLTextAreaElement>(t("commit.descriptionLabel"));
    fireEvent.keyDown(description, { key: "i", altKey: true });
    expect(description.value).toBe("Refs #7");
  });
});
