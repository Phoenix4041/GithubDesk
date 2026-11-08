import { call } from "@/shared/lib/tauri-client";
import type { GithubTarget } from "../target";
import type { Label, Milestone, Page } from "../types";
import type { NewRelease, Release, ReleaseAsset } from "./releases-model";

function base(target: GithubTarget) {
  return { accountId: target.accountId, owner: target.owner, repo: target.repo };
}

export function listReleases(target: GithubTarget, page: number): Promise<Page<Release>> {
  return call<Page<Release>>("github_releases_list", { ...base(target), page });
}

export function createRelease(target: GithubTarget, request: NewRelease): Promise<Release> {
  return call<Release>("github_release_create", { ...base(target), request });
}

export function updateRelease(
  target: GithubTarget,
  id: number,
  edit: { name?: string; body?: string; draft?: boolean; prerelease?: boolean },
): Promise<Release> {
  return call<Release>("github_release_update", { ...base(target), id, edit });
}

export function deleteRelease(target: GithubTarget, id: number): Promise<void> {
  return call<void>("github_release_delete", { ...base(target), id });
}

export function generateNotes(
  target: GithubTarget,
  tag: string,
  releaseTarget: string | null,
  previousTag: string | null,
): Promise<{ name: string; body: string }> {
  return call<{ name: string; body: string }>("github_release_notes", {
    ...base(target),
    tag,
    target: releaseTarget,
    previousTag,
  });
}

export function deleteAsset(target: GithubTarget, id: number): Promise<void> {
  return call<void>("github_release_asset_delete", { ...base(target), id });
}

export function uploadAsset(target: GithubTarget, releaseId: number, file: string): Promise<ReleaseAsset> {
  return call<ReleaseAsset>("github_release_asset_upload", { ...base(target), releaseId, file });
}

export function createLabel(target: GithubTarget, name: string, color: string, description: string): Promise<Label> {
  return call<Label>("github_label_create", { ...base(target), name, color, description });
}

export function updateLabel(
  target: GithubTarget,
  name: string,
  edit: { newName?: string; color?: string; description?: string },
): Promise<Label> {
  return call<Label>("github_label_update", { ...base(target), name, edit });
}

export function deleteLabel(target: GithubTarget, name: string): Promise<void> {
  return call<void>("github_label_delete", { ...base(target), name });
}

export function createMilestone(
  target: GithubTarget,
  title: string,
  description: string,
  dueOn: string | null,
): Promise<Milestone> {
  return call<Milestone>("github_milestone_create", { ...base(target), title, description, dueOn });
}

export function updateMilestone(
  target: GithubTarget,
  number: number,
  edit: { title?: string; description?: string; dueOn?: string; clearDue?: boolean; state?: "open" | "closed" },
): Promise<Milestone> {
  return call<Milestone>("github_milestone_update", { ...base(target), number, edit });
}

export function deleteMilestone(target: GithubTarget, number: number): Promise<void> {
  return call<void>("github_milestone_delete", { ...base(target), number });
}
