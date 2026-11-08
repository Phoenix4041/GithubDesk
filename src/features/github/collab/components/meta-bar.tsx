import { Flag, Pencil, Tag, UserPlus, Users } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { describeError } from "@/shared/lib/report-error";
import type { GithubTarget } from "../../target";
import type { Issue, PullRequest } from "../../types";
import { useAssignees, useLabels } from "../../issues/queries";
import { Button } from "@/shared/ui/button";
import { saveEdit, saveReviewers } from "../actions";
import { teamKey } from "../collab-model";
import { useMilestones, useTeams } from "../queries";
import { EditPostDialog } from "./edit-post-dialog";
import { PickerDialog } from "./picker-dialog";
import type { PickerItem } from "./picker-dialog";

type Picker = "reviewers" | "labels" | "assignees" | "milestone";

interface MetaBarProps {
  target: GithubTarget;
  number: number;
  subject: PullRequest | Issue;
  pull: boolean;
}

function reviewerKeys(subject: PullRequest | Issue): string[] {
  if (!("requestedReviewers" in subject)) {
    return [];
  }
  return [
    ...subject.requestedReviewers.map((user) => user.login),
    ...subject.requestedTeams.map((team) => teamKey(team.slug)),
  ];
}

export function MetaBar({ target, number, subject, pull }: MetaBarProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<Picker | null>(null);
  const [editing, setEditing] = useState(false);
  const labels = useLabels(target, open === "labels");
  const people = useAssignees(target, open === "assignees" || open === "reviewers");
  const teams = useTeams(target, open === "reviewers");
  const milestones = useMilestones(target, open === "milestone");

  const reviewerItems: PickerItem[] = [
    ...(people.data ?? []).map((user) => ({ id: user.login, label: user.login, avatarUrl: user.avatarUrl })),
    ...(teams.data ?? []).map((team) => ({ id: teamKey(team.slug), label: team.name || team.slug, detail: t("github.collab.team") })),
  ];
  const assigneeItems: PickerItem[] = (people.data ?? []).map((user) => ({
    id: user.login,
    label: user.login,
    avatarUrl: user.avatarUrl,
  }));
  const labelItems: PickerItem[] = (labels.data ?? []).map((label) => ({
    id: label.name,
    label: label.name,
    detail: label.description ?? undefined,
    color: label.color,
  }));
  const milestoneItems: PickerItem[] = (milestones.data ?? []).map((milestone) => ({
    id: String(milestone.number),
    label: milestone.title,
    detail: t("github.collab.milestoneProgress", { open: milestone.openIssues, closed: milestone.closedIssues }),
  }));

  const current = reviewerKeys(subject);
  const errorOf = (query: { isError: boolean; error: unknown }) => (query.isError ? describeError(query.error).message : undefined);

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label={t("github.collab.barLabel")}>
      <Button size="sm" icon={<Pencil className="size-3.5" />} onClick={() => setEditing(true)}>
        {t("github.collab.edit")}
      </Button>
      {pull ? (
        <Button size="sm" icon={<Users className="size-3.5" />} onClick={() => setOpen("reviewers")}>
          {t("github.collab.reviewers", { count: current.length })}
        </Button>
      ) : null}
      <Button size="sm" icon={<Tag className="size-3.5" />} onClick={() => setOpen("labels")}>
        {t("github.collab.labels", { count: subject.labels.length })}
      </Button>
      <Button size="sm" icon={<UserPlus className="size-3.5" />} onClick={() => setOpen("assignees")}>
        {t("github.collab.assignees", { count: subject.assignees.length })}
      </Button>
      <Button size="sm" icon={<Flag className="size-3.5" />} onClick={() => setOpen("milestone")}>
        {subject.milestone ? subject.milestone.title : t("github.collab.milestoneNone")}
      </Button>

      <EditPostDialog
        open={editing}
        title={t("github.collab.editTitle", { number })}
        initialTitle={subject.title}
        initialBody={subject.body ?? ""}
        onSave={(title, body) => saveEdit(target, number, { title, body })}
        onClose={() => setEditing(false)}
      />
      <PickerDialog
        open={open === "reviewers"}
        title={t("github.collab.reviewersTitle")}
        description={t("github.collab.reviewersDescription")}
        items={reviewerItems}
        selected={current}
        multiple
        loading={people.isPending}
        errorMessage={errorOf(people)}
        emptyText={t("github.collab.nobody")}
        onSave={(ids) => saveReviewers(target, number, current, ids)}
        onClose={() => setOpen(null)}
      />
      <PickerDialog
        open={open === "labels"}
        title={t("github.collab.labelsTitle")}
        items={labelItems}
        selected={subject.labels.map((label) => label.name)}
        multiple
        loading={labels.isPending}
        errorMessage={errorOf(labels)}
        emptyText={t("github.collab.noLabels")}
        onSave={(ids) => saveEdit(target, number, { labels: ids })}
        onClose={() => setOpen(null)}
      />
      <PickerDialog
        open={open === "assignees"}
        title={t("github.collab.assigneesTitle")}
        items={assigneeItems}
        selected={subject.assignees.map((user) => user.login)}
        multiple
        loading={people.isPending}
        errorMessage={errorOf(people)}
        emptyText={t("github.collab.nobody")}
        onSave={(ids) => saveEdit(target, number, { assignees: ids })}
        onClose={() => setOpen(null)}
      />
      <PickerDialog
        open={open === "milestone"}
        title={t("github.collab.milestoneTitle")}
        items={milestoneItems}
        selected={subject.milestone ? [String(subject.milestone.number)] : []}
        multiple={false}
        loading={milestones.isPending}
        errorMessage={errorOf(milestones)}
        emptyText={t("github.collab.noMilestones")}
        noneLabel={t("github.collab.milestoneNone")}
        onSave={(ids) =>
          saveEdit(target, number, ids.length === 0 ? { clearMilestone: true } : { milestone: Number(ids[0]) })
        }
        onClose={() => setOpen(null)}
      />
    </div>
  );
}
