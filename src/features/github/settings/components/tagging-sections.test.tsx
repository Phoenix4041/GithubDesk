import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { mockIPC } from "@tauri-apps/api/mocks";
import type { ParseKeys } from "i18next";
import { describe, expect, it } from "vitest";
import { i18next } from "@/i18n";
import { renderWithProviders } from "@/test/render";
import type { GithubTarget } from "../../target";
import { LabelsSection, MilestonesSection } from "./tagging-sections";

const TARGET: GithubTarget = { accountId: "github.com:octo", host: "github.com", owner: "acme", repo: "app", remoteName: "origin" };

type Calls = Record<string, Array<Record<string, unknown>>>;

function serve(): Calls {
  const calls: Calls = {};
  mockIPC((command, payload) => {
    const args = (payload ?? {}) as Record<string, unknown>;
    (calls[command] ??= []).push(args);
    if (command === "github_labels_list") {
      return [{ name: "bug", color: "d73a4a", description: "Broken" }];
    }
    if (command === "github_milestones_list") {
      return [
        { number: 3, title: "v1.0", description: "Goals", state: "open", openIssues: 2, closedIssues: 5, dueOn: "2026-12-31T00:00:00Z", htmlUrl: "" },
        { number: 4, title: "v0.9", description: null, state: "closed", openIssues: 0, closedIssues: 8, dueOn: null, htmlUrl: "" },
      ];
    }
    return null;
  });
  return calls;
}

const t = (key: ParseKeys, options?: Record<string, unknown>) => i18next.t(key, options);

async function lastCall(calls: Calls, command: string): Promise<Record<string, unknown>> {
  await waitFor(() => expect(calls[command]?.length ?? 0).toBeGreaterThan(0));
  const list = calls[command] ?? [];
  return list[list.length - 1] ?? {};
}

describe("LabelsSection", () => {
  it("creates a label with a cleaned color and refuses a bad one", async () => {
    const calls = serve();
    renderWithProviders(<LabelsSection target={TARGET} canAdmin />);
    fireEvent.click(await screen.findByRole("button", { name: t("github.settings.labels.new") }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(t("github.settings.labels.name")), { target: { value: "help wanted" } });
    fireEvent.change(within(dialog).getByLabelText(t("github.settings.labels.color")), { target: { value: "nothex" } });
    fireEvent.click(within(dialog).getByRole("button", { name: t("github.settings.save") }));
    expect(await within(dialog).findByText(t("github.settings.labels.colorInvalid"))).toBeTruthy();
    expect(calls.github_label_create).toBeUndefined();

    fireEvent.change(within(dialog).getByLabelText(t("github.settings.labels.color")), { target: { value: "#008672" } });
    fireEvent.click(within(dialog).getByRole("button", { name: t("github.settings.save") }));
    expect(await lastCall(calls, "github_label_create")).toMatchObject({ name: "help wanted", color: "008672", description: "" });
  });

  it("renames a label and deletes it after confirming", async () => {
    const calls = serve();
    renderWithProviders(<LabelsSection target={TARGET} canAdmin />);
    fireEvent.click(await screen.findByRole("button", { name: t("github.settings.labels.edit", { name: "bug" }) }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(t("github.settings.labels.name")), { target: { value: "defect" } });
    fireEvent.click(within(dialog).getByRole("button", { name: t("github.settings.save") }));
    expect(await lastCall(calls, "github_label_update")).toMatchObject({
      name: "bug",
      edit: { newName: "defect", color: "d73a4a", description: "Broken" },
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: t("github.settings.labels.remove", { name: "bug" }) }));
    fireEvent.click(await screen.findByRole("button", { name: t("github.settings.labels.removeConfirm") }));
    expect(await lastCall(calls, "github_label_delete")).toMatchObject({ name: "bug" });
  });

  it("is read only without admin access", async () => {
    serve();
    renderWithProviders(<LabelsSection target={TARGET} canAdmin={false} />);
    expect((await screen.findByRole<HTMLButtonElement>("button", { name: t("github.settings.labels.new") })).disabled).toBe(true);
    expect((await screen.findByRole<HTMLButtonElement>("button", { name: t("github.settings.labels.remove", { name: "bug" }) })).disabled).toBe(true);
  });
});

describe("MilestonesSection", () => {
  it("lists open and closed milestones with their progress and date", async () => {
    const calls = serve();
    renderWithProviders(<MilestonesSection target={TARGET} canAdmin />);
    expect(await screen.findByText("v1.0")).toBeTruthy();
    expect(screen.getByText(/2026-12-31/)).toBeTruthy();
    expect(screen.getByText(t("github.settings.milestones.closedBadge"))).toBeTruthy();
    expect(calls.github_milestones_list?.[0]).toMatchObject({ milestoneState: "all" });
  });

  it("creates a milestone with a due date converted to a timestamp", async () => {
    const calls = serve();
    renderWithProviders(<MilestonesSection target={TARGET} canAdmin />);
    fireEvent.click(await screen.findByRole("button", { name: t("github.settings.milestones.new") }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: t("github.settings.save") }));
    expect(await within(dialog).findByText(t("github.settings.milestones.titleRequired"))).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText(t("github.settings.milestones.titleLabel")), { target: { value: "v2" } });
    fireEvent.change(within(dialog).getByLabelText(t("github.settings.milestones.due")), { target: { value: "2027-03-15" } });
    fireEvent.click(within(dialog).getByRole("button", { name: t("github.settings.save") }));
    expect(await lastCall(calls, "github_milestone_create")).toMatchObject({ title: "v2", dueOn: "2027-03-15T00:00:00Z" });
  });

  it("closes a milestone, clears its date and deletes another one", async () => {
    const calls = serve();
    renderWithProviders(<MilestonesSection target={TARGET} canAdmin />);
    fireEvent.click(await screen.findByRole("button", { name: t("github.settings.milestones.edit", { title: "v1.0" }) }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(t("github.settings.milestones.due")), { target: { value: "" } });
    fireEvent.click(within(dialog).getByLabelText(t("github.settings.milestones.closed")));
    fireEvent.click(within(dialog).getByRole("button", { name: t("github.settings.save") }));
    expect(await lastCall(calls, "github_milestone_update")).toMatchObject({
      number: 3,
      edit: { title: "v1.0", clearDue: true, state: "closed" },
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: t("github.settings.milestones.remove", { title: "v0.9" }) }));
    fireEvent.click(await screen.findByRole("button", { name: t("github.settings.milestones.removeConfirm") }));
    expect(await lastCall(calls, "github_milestone_delete")).toMatchObject({ number: 4 });
  });
});
