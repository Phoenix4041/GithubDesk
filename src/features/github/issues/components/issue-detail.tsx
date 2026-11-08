import { ExternalLink } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { isoToUnixSeconds } from "@/shared/lib/dates";
import { formatRelativeTime } from "@/shared/lib/format";
import { openExternal } from "@/shared/lib/external";
import { describeError } from "@/shared/lib/report-error";
import { Avatar } from "@/shared/ui/avatar";
import { Button } from "@/shared/ui/button";
import { EmptyState } from "@/shared/ui/empty-state";
import { ErrorState } from "@/shared/ui/error-state";
import { Skeleton } from "@/shared/ui/skeleton";
import { MetaBar } from "../../collab/components/meta-bar";
import { CommentComposer } from "../../components/comment-composer";
import { StateBadge, issueIcon, issueTone } from "../../components/state-badge";
import { LabelChips, TimelineEntry } from "../../components/timeline";
import type { GithubTarget } from "../../target";
import { addIssueComment, changeIssueState } from "../actions";
import { useIssueBundle } from "../queries";
import { useIssueStore } from "../store";

interface IssueDetailProps {
  target: GithubTarget;
}

export function IssueDetail({ target }: IssueDetailProps) {
  const { t, i18n } = useTranslation();
  const selected = useIssueStore((state) => state.selected);
  const bundle = useIssueBundle(target, selected);
  const [reason, setReason] = useState<"completed" | "not_planned">("completed");
  const [busy, setBusy] = useState(false);

  if (selected === null) {
    return (
      <EmptyState
        icon={issueIcon("open", null, "size-5")}
        title={t("github.issues.nothingSelected.title")}
        description={t("github.issues.nothingSelected.description")}
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

  const { issue, comments } = bundle.data;
  const stateLabel =
    issue.state === "open"
      ? t("github.issues.state.open")
      : issue.stateReason === "not_planned"
        ? t("github.issues.state.notPlanned")
        : t("github.issues.state.closed");

  async function toggle() {
    setBusy(true);
    if (issue.state === "open") {
      await changeIssueState(target, issue.number, "closed", reason);
    } else {
      await changeIssueState(target, issue.number, "open", "reopened");
    }
    setBusy(false);
  }

  return (
    <>
      <header className="flex flex-col gap-2 border-b border-line px-5 py-3">
        <h2 className="text-[15px] leading-snug font-semibold">
          {issue.title} <span className="font-normal text-muted">#{issue.number}</span>
        </h2>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <StateBadge tone={issueTone(issue.state, issue.stateReason)} label={stateLabel} icon={issueIcon(issue.state, issue.stateReason, "size-3")} />
          <span>
            {t("github.issues.openedBy", { user: issue.user?.login ?? "-" })} &middot;{" "}
            {formatRelativeTime(isoToUnixSeconds(issue.createdAt), i18n.language)}
          </span>
          <LabelChips labels={issue.labels} />
          {issue.assignees.length > 0 ? (
            <span className="flex items-center gap-1">
              {issue.assignees.map((user) => (
                <Avatar key={user.login} url={user.avatarUrl} name={user.login} size={18} />
              ))}
              <span>{issue.assignees.map((user) => user.login).join(", ")}</span>
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {issue.state === "open" ? (
            <>
              <select
                aria-label={t("github.issues.closeReason")}
                value={reason}
                onChange={(event) => setReason(event.target.value === "not_planned" ? "not_planned" : "completed")}
                className="h-7 cursor-pointer rounded-md border border-line bg-surface px-1.5 text-xs text-fg focus-visible:border-accent focus-visible:outline-none"
              >
                <option value="completed">{t("github.issues.reasons.completed")}</option>
                <option value="not_planned">{t("github.issues.reasons.notPlanned")}</option>
              </select>
              <Button size="sm" loading={busy} onClick={() => void toggle()}>
                {t("github.issues.close")}
              </Button>
            </>
          ) : (
            <Button size="sm" loading={busy} onClick={() => void toggle()}>
              {t("github.issues.reopen")}
            </Button>
          )}
          <Button size="sm" variant="ghost" icon={<ExternalLink className="size-3.5" />} onClick={() => void openExternal(issue.htmlUrl)}>
            {t("github.openOnGithub")}
          </Button>
        </div>
        <MetaBar target={target} number={issue.number} subject={issue} pull={false} />
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        <TimelineEntry user={issue.user} createdAt={issue.createdAt} body={issue.body} />
        {comments.map((comment) => (
          <TimelineEntry key={comment.id} user={comment.user} createdAt={comment.createdAt} body={comment.body} />
        ))}
        <CommentComposer onSubmit={(body) => addIssueComment(target, issue.number, body)} />
      </div>
    </>
  );
}
