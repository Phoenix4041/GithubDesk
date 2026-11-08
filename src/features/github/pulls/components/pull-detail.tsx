import { ExternalLink, GitBranch, GitMerge, MessageSquareText, RefreshCw, SquarePen } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";
import { isoToUnixSeconds } from "@/shared/lib/dates";
import { formatRelativeTime } from "@/shared/lib/format";
import { openExternal } from "@/shared/lib/external";
import { describeError } from "@/shared/lib/report-error";
import { Button } from "@/shared/ui/button";
import { EmptyState } from "@/shared/ui/empty-state";
import { ErrorState } from "@/shared/ui/error-state";
import { Skeleton } from "@/shared/ui/skeleton";
import type { Progress } from "@/shared/types/git";
import { changeDraft, refreshPullBranch } from "../../collab/actions";
import { MetaBar } from "../../collab/components/meta-bar";
import { CommentComposer } from "../../components/comment-composer";
import { StateBadge, pullIcon, pullTone } from "../../components/state-badge";
import { LabelChips, TimelineEntry } from "../../components/timeline";
import { useAccounts } from "../../queries";
import type { GithubTarget } from "../../target";
import type { Comment, PullBundle, Review } from "../../types";
import { addPullComment, bringPullToThisComputer, changePullState } from "../actions";
import { allowedMergeMethods, canMerge, pullState, summarizeReviews } from "../pull-model";
import { usePullBundle, useRepoInfo } from "../queries";
import { usePullStore } from "../store";
import type { PullDetailTab } from "../store";
import { ChecksList } from "./checks-list";
import { MergeDialog, ReviewDialog } from "./pull-dialogs";
import { PullFiles } from "./pull-files";

interface PullDetailProps {
  repoPath: string;
  target: GithubTarget;
}

function reviewHeadline(state: string, t: (key: "github.pulls.review.states.APPROVED" | "github.pulls.review.states.CHANGES_REQUESTED" | "github.pulls.review.states.COMMENTED" | "github.pulls.review.states.DISMISSED") => string): string {
  switch (state) {
    case "APPROVED":
      return t("github.pulls.review.states.APPROVED");
    case "CHANGES_REQUESTED":
      return t("github.pulls.review.states.CHANGES_REQUESTED");
    case "DISMISSED":
      return t("github.pulls.review.states.DISMISSED");
    default:
      return t("github.pulls.review.states.COMMENTED");
  }
}

type TimelineItem =
  | { kind: "comment"; at: string; comment: Comment }
  | { kind: "review"; at: string; review: Review };

function buildTimeline(bundle: PullBundle): TimelineItem[] {
  const items: TimelineItem[] = [
    ...bundle.comments.map((comment) => ({ kind: "comment" as const, at: comment.createdAt, comment })),
    ...bundle.reviews
      .filter((review) => review.state !== "PENDING" && ((review.body ?? "").trim().length > 0 || review.state !== "COMMENTED"))
      .map((review) => ({ kind: "review" as const, at: review.submittedAt ?? "", review })),
  ];
  return items.sort((left, right) => left.at.localeCompare(right.at));
}

function Conversation({ target, bundle }: { target: GithubTarget; bundle: PullBundle }) {
  const { t } = useTranslation();
  const accounts = useAccounts();
  const [reviewing, setReviewing] = useState(false);
  const timeline = useMemo(() => buildTimeline(bundle), [bundle]);
  const summary = summarizeReviews(bundle.reviews);
  const login = accounts.data?.find((account) => account.id === target.accountId)?.login;
  const isOwnPull = login !== undefined && bundle.pull.user?.login.toLowerCase() === login.toLowerCase();

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
      <TimelineEntry user={bundle.pull.user} createdAt={bundle.pull.createdAt} body={bundle.pull.body} />
      <ChecksList checks={bundle.checks} />
      {summary.approved.length > 0 || summary.changesRequested.length > 0 ? (
        <p className="text-xs text-muted">
          {summary.approved.length > 0 ? t("github.pulls.review.approvedBy", { users: summary.approved.join(", ") }) : null}
          {summary.approved.length > 0 && summary.changesRequested.length > 0 ? " · " : null}
          {summary.changesRequested.length > 0
            ? t("github.pulls.review.changesBy", { users: summary.changesRequested.join(", ") })
            : null}
        </p>
      ) : null}
      {timeline.map((item) =>
        item.kind === "comment" ? (
          <TimelineEntry key={`c${item.comment.id}`} user={item.comment.user} createdAt={item.comment.createdAt} body={item.comment.body} />
        ) : (
          <TimelineEntry
            key={`r${item.review.id}`}
            user={item.review.user}
            createdAt={item.review.submittedAt}
            headline={reviewHeadline(item.review.state, t)}
            body={item.review.body}
          />
        ),
      )}
      <CommentComposer
        onSubmit={(body) => addPullComment(target, bundle.pull.number, body)}
        extraActions={
          bundle.pull.state === "open" ? (
            <Button size="sm" icon={<MessageSquareText className="size-3.5" />} onClick={() => setReviewing(true)}>
              {t("github.pulls.review.open")}
            </Button>
          ) : null
        }
      />
      <ReviewDialog
        open={reviewing}
        target={target}
        number={bundle.pull.number}
        isOwnPull={isOwnPull}
        onClose={() => setReviewing(false)}
      />
    </div>
  );
}

export function PullDetail({ repoPath, target }: PullDetailProps) {
  const { t, i18n } = useTranslation();
  const selected = usePullStore((state) => state.selected);
  const detailTab = usePullStore((state) => state.detailTab);
  const setDetailTab = usePullStore((state) => state.setDetailTab);
  const bundle = usePullBundle(target, selected);
  const info = useRepoInfo(target);
  const [merging, setMerging] = useState(false);
  const [busy, setBusy] = useState<"checkout" | "state" | "draft" | "branch" | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);

  if (selected === null) {
    return (
      <EmptyState
        icon={pullIcon("open", "size-5")}
        title={t("github.pulls.nothingSelected.title")}
        description={t("github.pulls.nothingSelected.description")}
      />
    );
  }
  if (bundle.isPending) {
    return (
      <div className="flex flex-col gap-3 p-5">
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-32" />
      </div>
    );
  }
  if (bundle.isError) {
    const description = describeError(bundle.error);
    return <ErrorState title={description.title} message={description.message} onRetry={() => void bundle.refetch()} />;
  }

  const { pull } = bundle.data;
  const state = pullState(pull);
  const methods = info.data ? allowedMergeMethods(info.data) : [];
  const mergeable = canMerge(pull, info.data) && methods.length > 0;

  async function checkout() {
    setBusy("checkout");
    await bringPullToThisComputer(repoPath, target, pull.number, setProgress);
    setBusy(null);
    setProgress(null);
  }

  async function toggleState() {
    setBusy("state");
    await changePullState(target, pull.number, pull.state === "open" ? "closed" : "open");
    setBusy(null);
  }

  async function toggleDraft() {
    setBusy("draft");
    await changeDraft(target, pull.number, !pull.draft);
    setBusy(null);
  }

  async function updateBranch() {
    setBusy("branch");
    await refreshPullBranch(target, pull.number);
    setBusy(null);
  }

  const tabs: Array<{ id: PullDetailTab; label: string }> = [
    { id: "conversation", label: t("github.pulls.tabs.conversation", { count: pull.comments ?? 0 }) },
    { id: "files", label: t("github.pulls.tabs.files", { count: pull.changedFiles ?? 0 }) },
  ];

  return (
    <>
      <header className="flex flex-col gap-2 border-b border-line px-5 pt-3">
        <h2 className="text-[15px] leading-snug font-semibold">
          {pull.title} <span className="font-normal text-muted">#{pull.number}</span>
        </h2>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <StateBadge tone={pullTone(state)} label={t(`github.pulls.state.${state}`)} icon={pullIcon(state, "size-3")} />
          <span>
            {t("github.pulls.wantsToMerge", { user: pull.user?.login ?? "-" })}{" "}
            <span className="inline-flex items-center gap-1 rounded bg-subtle px-1.5 py-px font-mono text-fg">
              <GitBranch className="size-3" />
              {pull.head.refName}
            </span>{" "}
            {t("github.pulls.into")}{" "}
            <span className="rounded bg-subtle px-1.5 py-px font-mono text-fg">{pull.base.refName}</span>
          </span>
          <span>&middot; {formatRelativeTime(isoToUnixSeconds(pull.updatedAt), i18n.language)}</span>
          {pull.additions !== null ? (
            <span className="tabular-nums">
              <span className="text-add">+{pull.additions}</span> <span className="text-del">-{pull.deletions ?? 0}</span>
            </span>
          ) : null}
          <LabelChips labels={pull.labels} />
        </div>
        <div className="flex flex-wrap items-center gap-2 pb-2">
          <Button size="sm" loading={busy === "checkout"} onClick={() => void checkout()} icon={<RefreshCw className="size-3.5" />}>
            {progress ? `${progress.percent}%` : t("github.pulls.checkout")}
          </Button>
          {state === "open" || state === "draft" ? (
            <Button size="sm" variant="primary" disabled={!mergeable} icon={<GitMerge className="size-3.5" />} onClick={() => setMerging(true)}>
              {t("github.pulls.merge.button")}
            </Button>
          ) : null}
          {state === "open" || state === "draft" ? (
            <Button size="sm" icon={<SquarePen className="size-3.5" />} loading={busy === "draft"} onClick={() => void toggleDraft()}>
              {pull.draft ? t("github.collab.markReady") : t("github.collab.convertToDraft")}
            </Button>
          ) : null}
          {pull.mergeableState === "behind" && pull.state === "open" ? (
            <Button size="sm" icon={<RefreshCw className="size-3.5" />} loading={busy === "branch"} onClick={() => void updateBranch()}>
              {t("github.collab.updateBranch")}
            </Button>
          ) : null}
          {state !== "merged" ? (
            <Button size="sm" loading={busy === "state"} onClick={() => void toggleState()}>
              {pull.state === "open" ? t("github.pulls.close") : t("github.pulls.reopen")}
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" icon={<ExternalLink className="size-3.5" />} onClick={() => void openExternal(pull.htmlUrl)}>
            {t("github.openOnGithub")}
          </Button>
          {pull.mergeable === false && state === "open" ? (
            <span className="text-xs text-danger">{t("github.pulls.hasConflicts")}</span>
          ) : null}
        </div>
        <div className="pb-2">
          <MetaBar target={target} number={pull.number} subject={pull} pull />
        </div>
        <div role="tablist" aria-label={t("github.pulls.tabs.label")} className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={detailTab === tab.id}
              onClick={() => setDetailTab(tab.id)}
              className={cn(
                "relative h-9 cursor-pointer px-3 text-[13px] font-medium transition-colors duration-150",
                detailTab === tab.id ? "text-fg" : "text-muted hover:text-fg",
              )}
            >
              {tab.label}
              <span
                aria-hidden="true"
                className={cn(
                  "absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-accent transition-transform duration-200",
                  detailTab === tab.id ? "scale-x-100" : "scale-x-0",
                )}
              />
            </button>
          ))}
        </div>
      </header>
      {detailTab === "conversation" ? (
        <Conversation target={target} bundle={bundle.data} />
      ) : (
        <PullFiles target={target} number={pull.number} headSha={pull.head.sha} />
      )}
      <MergeDialog open={merging} target={target} pull={pull} methods={methods} onClose={() => setMerging(false)} />
    </>
  );
}
