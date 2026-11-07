import { CircleCheck, CircleDot, CircleSlash, GitMerge, GitPullRequest, GitPullRequestClosed, GitPullRequestDraft } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

export type BadgeTone = "success" | "danger" | "accent" | "muted" | "warning";

const toneClasses: Record<BadgeTone, string> = {
  success: "bg-add-bg text-add",
  danger: "bg-del-bg text-del",
  accent: "bg-accent-soft text-accent",
  muted: "bg-subtle text-muted",
  warning: "bg-warning/15 text-warning",
};

interface StateBadgeProps {
  tone: BadgeTone;
  label: string;
  icon?: ReactNode;
  className?: string;
}

export function StateBadge({ tone, label, icon, className }: StateBadgeProps) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", toneClasses[tone], className)}>
      {icon}
      {label}
    </span>
  );
}

export function pullIcon(state: "open" | "draft" | "merged" | "closed", size = "size-3.5"): ReactNode {
  switch (state) {
    case "open":
      return <GitPullRequest className={size} />;
    case "draft":
      return <GitPullRequestDraft className={size} />;
    case "merged":
      return <GitMerge className={size} />;
    case "closed":
      return <GitPullRequestClosed className={size} />;
  }
}

export function pullTone(state: "open" | "draft" | "merged" | "closed"): BadgeTone {
  switch (state) {
    case "open":
      return "success";
    case "draft":
      return "muted";
    case "merged":
      return "accent";
    case "closed":
      return "danger";
  }
}

export function issueIcon(state: string, reason: string | null, size = "size-3.5"): ReactNode {
  if (state === "open") {
    return <CircleDot className={size} />;
  }
  return reason === "not_planned" ? <CircleSlash className={size} /> : <CircleCheck className={size} />;
}

export function issueTone(state: string, reason: string | null): BadgeTone {
  if (state === "open") {
    return "success";
  }
  return reason === "not_planned" ? "muted" : "accent";
}
