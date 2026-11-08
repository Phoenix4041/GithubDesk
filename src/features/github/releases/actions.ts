import { i18next } from "@/i18n";
import { pickFiles } from "@/shared/lib/dialogs";
import { queryClient } from "@/shared/lib/query-client";
import { reportError } from "@/shared/lib/report-error";
import { showToast } from "@/shared/ui/toast-store";
import { targetScope } from "../target";
import type { GithubTarget } from "../target";
import {
  createLabel,
  createMilestone,
  createRelease,
  deleteAsset,
  deleteLabel,
  deleteMilestone,
  deleteRelease,
  updateLabel,
  updateMilestone,
  updateRelease,
  uploadAsset,
} from "./api";
import type { NewRelease, Release } from "./releases-model";
import { useReleaseStore } from "./store";

async function run<T>(target: GithubTarget, work: () => Promise<T>, message: ((result: T) => string) | null): Promise<{ value: T } | null> {
  try {
    const result = await work();
    await queryClient.invalidateQueries({ queryKey: targetScope(target) });
    if (message) {
      showToast({ kind: "success", title: message(result) });
    }
    return { value: result };
  } catch (error) {
    reportError(error);
    await queryClient.invalidateQueries({ queryKey: targetScope(target) });
    return null;
  }
}

export async function publishNewRelease(target: GithubTarget, request: NewRelease): Promise<Release | null> {
  const created = await run(target, () => createRelease(target, request), (release) =>
    i18next.t("github.releases.created", { tag: release.tagName }),
  );
  if (created) {
    useReleaseStore.getState().select(created.value.id);
    return created.value;
  }
  return null;
}

export async function editRelease(
  target: GithubTarget,
  id: number,
  edit: { name?: string; body?: string; draft?: boolean; prerelease?: boolean },
): Promise<boolean> {
  const updated = await run(target, () => updateRelease(target, id, edit), () => i18next.t("github.releases.updated"));
  return updated !== null;
}

export async function removeRelease(target: GithubTarget, id: number): Promise<boolean> {
  const done = await run(target, () => deleteRelease(target, id), () => i18next.t("github.releases.deleted"));
  if (done !== null) {
    useReleaseStore.getState().select(null);
  }
  return done !== null;
}

export async function removeAsset(target: GithubTarget, id: number): Promise<boolean> {
  const done = await run(target, () => deleteAsset(target, id), () => i18next.t("github.releases.assetDeleted"));
  return done !== null;
}

export async function attachFiles(target: GithubTarget, releaseId: number): Promise<number> {
  const files = await pickFiles(i18next.t("github.releases.chooseFiles"), []);
  let uploaded = 0;
  for (const file of files) {
    const asset = await run(target, () => uploadAsset(target, releaseId, file), (result) =>
      i18next.t("github.releases.assetUploaded", { name: result.name }),
    );
    if (asset) {
      uploaded += 1;
    }
  }
  return uploaded;
}

export function addLabel(target: GithubTarget, name: string, color: string, description: string): Promise<boolean> {
  return run(target, () => createLabel(target, name, color, description), () => i18next.t("github.settings.labels.created", { name })).then(
    (result) => result !== null,
  );
}

export function changeLabel(
  target: GithubTarget,
  name: string,
  edit: { newName?: string; color?: string; description?: string },
): Promise<boolean> {
  return run(target, () => updateLabel(target, name, edit), () => i18next.t("github.settings.labels.updated", { name })).then(
    (result) => result !== null,
  );
}

export function removeLabel(target: GithubTarget, name: string): Promise<boolean> {
  return run(target, () => deleteLabel(target, name), () => i18next.t("github.settings.labels.deleted", { name })).then(
    (result) => result !== null,
  );
}

export function addMilestone(target: GithubTarget, title: string, description: string, dueOn: string | null): Promise<boolean> {
  return run(target, () => createMilestone(target, title, description, dueOn), () => i18next.t("github.settings.milestones.created", { title })).then(
    (result) => result !== null,
  );
}

export function changeMilestone(
  target: GithubTarget,
  number: number,
  edit: { title?: string; description?: string; dueOn?: string; clearDue?: boolean; state?: "open" | "closed" },
): Promise<boolean> {
  return run(target, () => updateMilestone(target, number, edit), () => i18next.t("github.settings.milestones.updated")).then(
    (result) => result !== null,
  );
}

export function removeMilestone(target: GithubTarget, number: number): Promise<boolean> {
  return run(target, () => deleteMilestone(target, number), () => i18next.t("github.settings.milestones.deleted")).then(
    (result) => result !== null,
  );
}
