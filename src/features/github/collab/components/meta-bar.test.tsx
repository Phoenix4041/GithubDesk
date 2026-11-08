import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { mockIPC } from "@tauri-apps/api/mocks";
import type { ParseKeys } from "i18next";
import { describe, expect, it } from "vitest";
import { i18next } from "@/i18n";
import { renderWithProviders } from "@/test/render";
import type { GithubTarget } from "../../target";
import type { Issue, PullRequest } from "../../types";
import type { IssueEdit } from "../api";
import { MetaBar } from "./meta-bar";

const TARGET: GithubTarget = { accountId: "github.com:octo", host: "github.com", owner: "acme", repo: "app", remoteName: "origin" };

const USERS = [
  { login: "hubot", avatarUrl: "", htmlUrl: "" },
  { login: "octo", avatarUrl: "", htmlUrl: "" },
];

function pull(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    number: 7,
    nodeId: "PR_7",
    title: "Add login",
    state: "open",
    draft: false,
    body: "Body",
    user: null,
    labels: [{ name: "bug", color: "d73a4a", description: null }],
    assignees: [],
    requestedReviewers: [{ login: "hubot", avatarUrl: "", htmlUrl: "" }],
    requestedTeams: [{ slug: "core", name: "Core" }],
    milestone: null,
    createdAt: "",
    updatedAt: "",
    closedAt: null,
    mergedAt: null,
    htmlUrl: "",
    head: { label: "", refName: "feature", sha: "a", repo: null },
    base: { label: "", refName: "main", sha: "b", repo: null },
    merged: false,
    mergeable: true,
    mergeableState: "clean",
    additions: null,
    deletions: null,
    changedFiles: null,
    commits: null,
    comments: null,
    reviewComments: null,
    mergedBy: null,
    ...overrides,
  };
}

interface Calls {
  edits: Array<{ number: number; edit: IssueEdit }>;
  requested: Array<{ reviewers: string[]; teams: string[] }>;
  removed: Array<{ reviewers: string[]; teams: string[] }>;
}

function serve(options: { peopleFail?: boolean } = {}): Calls {
  const calls: Calls = { edits: [], requested: [], removed: [] };
  mockIPC((command, payload) => {
    const args = payload as Record<string, unknown>;
    switch (command) {
      case "github_labels_list":
        return [
          { name: "bug", color: "d73a4a", description: "Something is broken" },
          { name: "help wanted", color: "008672", description: null },
        ];
      case "github_assignees_list":
        if (options.peopleFail) {
          throw Object.assign(new Error("offline"), { kind: "networkUnavailable", suggestedAction: null, detail: "" });
        }
        return USERS;
      case "github_repo_teams":
        return [{ slug: "core", name: "Core" }];
      case "github_milestones_list":
        return [{ number: 3, title: "v1.0", description: null, state: "open", openIssues: 2, closedIssues: 5, dueOn: null, htmlUrl: "" }];
      case "github_issue_edit":
        calls.edits.push({ number: args.number as number, edit: args.edit as IssueEdit });
        return null;
      case "github_pull_request_reviewers":
        calls.requested.push({ reviewers: args.reviewers as string[], teams: args.teams as string[] });
        return null;
      case "github_pull_remove_reviewers":
        calls.removed.push({ reviewers: args.reviewers as string[], teams: args.teams as string[] });
        return null;
      default:
        return null;
    }
  });
  return calls;
}

const t = (key: ParseKeys, options?: Record<string, unknown>) => i18next.t(key, options);

function renderPull(subject: PullRequest = pull()) {
  return renderWithProviders(<MetaBar target={TARGET} number={7} subject={subject} pull />);
}

describe("MetaBar", () => {
  it("shows how many reviewers, labels and assignees there are", () => {
    serve();
    renderPull();
    expect(screen.getByRole("button", { name: t("github.collab.reviewers", { count: 2 }) })).toBeTruthy();
    expect(screen.getByRole("button", { name: t("github.collab.labels", { count: 1 }) })).toBeTruthy();
    expect(screen.getByRole("button", { name: t("github.collab.assignees", { count: 0 }) })).toBeTruthy();
    expect(screen.getByRole("button", { name: t("github.collab.milestoneNone") })).toBeTruthy();
  });

  it("does not offer reviewers on an issue", () => {
    serve();
    const issue: Issue = {
      number: 7,
      title: "Crash",
      state: "open",
      stateReason: null,
      body: null,
      user: null,
      labels: [],
      assignees: [],
      comments: 0,
      milestone: null,
      createdAt: "",
      updatedAt: "",
      closedAt: null,
      htmlUrl: "",
    };
    renderWithProviders(<MetaBar target={TARGET} number={7} subject={issue} pull={false} />);
    expect(screen.queryByRole("button", { name: /Revisores/ })).toBeNull();
    expect(screen.getByRole("button", { name: t("github.collab.edit") })).toBeTruthy();
  });

  it("sends only the reviewers that were added and removed, users and teams apart", async () => {
    const calls = serve();
    renderPull();
    fireEvent.click(screen.getByRole("button", { name: t("github.collab.reviewers", { count: 2 }) }));
    const hubot = await screen.findByLabelText<HTMLInputElement>("hubot");
    expect(hubot.checked).toBe(true);
    expect(screen.getByLabelText<HTMLInputElement>("Core").checked).toBe(true);
    expect(screen.getByLabelText<HTMLInputElement>("octo").checked).toBe(false);
    const save = screen.getByRole<HTMLButtonElement>("button", { name: t("github.collab.save") });
    expect(save.disabled).toBe(true);

    fireEvent.click(hubot);
    fireEvent.click(screen.getByLabelText("octo"));
    expect(save.disabled).toBe(false);
    fireEvent.click(save);

    await waitFor(() => expect(calls.requested).toHaveLength(1));
    expect(calls.requested[0]).toEqual({ reviewers: ["octo"], teams: [] });
    await waitFor(() => expect(calls.removed).toHaveLength(1));
    expect(calls.removed[0]).toEqual({ reviewers: ["hubot"], teams: [] });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("replaces the whole label set", async () => {
    const calls = serve();
    renderPull();
    fireEvent.click(screen.getByRole("button", { name: t("github.collab.labels", { count: 1 }) }));
    fireEvent.click(await screen.findByLabelText("help wanted"));
    fireEvent.click(screen.getByRole("button", { name: t("github.collab.save") }));
    await waitFor(() => expect(calls.edits).toHaveLength(1));
    expect(calls.edits[0]).toEqual({ number: 7, edit: { labels: ["bug", "help wanted"] } });
  });

  it("sets and clears the milestone", async () => {
    const calls = serve();
    const first = renderPull();
    fireEvent.click(screen.getByRole("button", { name: t("github.collab.milestoneNone") }));
    fireEvent.click(await screen.findByRole("radio", { name: /v1\.0/ }));
    fireEvent.click(screen.getByRole("button", { name: t("github.collab.save") }));
    await waitFor(() => expect(calls.edits).toHaveLength(1));
    expect(calls.edits[0]?.edit).toEqual({ milestone: 3 });
    first.unmount();

    renderPull(pull({ milestone: { number: 3, title: "v1.0", description: null, state: "open", openIssues: 2, closedIssues: 5, dueOn: null, htmlUrl: "" } }));
    fireEvent.click(screen.getByRole("button", { name: "v1.0" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(await within(dialog).findByRole("radio", { name: t("github.collab.milestoneNone") }));
    fireEvent.click(within(dialog).getByRole("button", { name: t("github.collab.save") }));
    await waitFor(() => expect(calls.edits).toHaveLength(2));
    expect(calls.edits[1]?.edit).toEqual({ clearMilestone: true });
  });

  it("edits the title and the description", async () => {
    const calls = serve();
    renderPull();
    fireEvent.click(screen.getByRole("button", { name: t("github.collab.edit") }));
    const title = await screen.findByLabelText<HTMLInputElement>(t("github.collab.titleLabel"));
    expect(title.value).toBe("Add login");
    const save = screen.getByRole<HTMLButtonElement>("button", { name: t("github.collab.save") });
    expect(save.disabled).toBe(true);
    fireEvent.change(title, { target: { value: "  Add the login page " } });
    fireEvent.change(screen.getByLabelText(t("github.collab.bodyLabel")), { target: { value: "New body" } });
    fireEvent.click(save);
    await waitFor(() => expect(calls.edits).toHaveLength(1));
    expect(calls.edits[0]).toEqual({ number: 7, edit: { title: "Add the login page", body: "New body" } });
  });

  it("explains when the list of people could not be loaded", async () => {
    serve({ peopleFail: true });
    renderPull();
    fireEvent.click(screen.getByRole("button", { name: t("github.collab.assignees", { count: 0 }) }));
    expect(await screen.findByText(t("errors.networkUnavailable.message"))).toBeTruthy();
  });
});
