import { call, callWithProgress } from "@/shared/lib/tauri-client";
import type { NewRepo, Progress, RepoSummary } from "@/shared/types/git";

export interface InboxItem {
  number: number;
  title: string;
  repository: string;
  pullRequest: boolean;
  draft: boolean;
  htmlUrl: string;
  updatedAt: string;
  author: string | null;
  comments: number;
}

export interface Inbox {
  reviewRequested: InboxItem[];
  assigned: InboxItem[];
  authored: InboxItem[];
}

export function getInbox(accountId: string, org: string | null): Promise<Inbox> {
  return call<Inbox>("github_inbox", { accountId, org });
}

export function publishRepository(
  path: string,
  accountId: string,
  org: string | null,
  request: NewRepo,
  jobId: string,
  onProgress: (progress: Progress) => void,
): Promise<RepoSummary> {
  return callWithProgress<RepoSummary>(
    "github_publish_repository",
    { path, accountId, org, request, jobId },
    onProgress,
  );
}
