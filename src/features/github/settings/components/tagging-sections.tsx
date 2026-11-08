import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { Dialog } from "@/shared/ui/dialog";
import { IconButton } from "@/shared/ui/icon-button";
import { Skeleton } from "@/shared/ui/skeleton";
import { TextField } from "@/shared/ui/text-field";
import { useQuery } from "@tanstack/react-query";
import { listMilestones } from "../../collab/api";
import { useLabels } from "../../issues/queries";
import { addLabel, addMilestone, changeLabel, changeMilestone, removeLabel, removeMilestone } from "../../releases/actions";
import { dueDateToIso, isoToDueDate, normalizeColor } from "../../releases/releases-model";
import { targetKey } from "../../target";
import type { GithubTarget } from "../../target";
import type { Label, Milestone } from "../../types";
import { QueryError, SectionFrame, ToggleRow } from "./section-frame";

interface Props {
  target: GithubTarget;
  canAdmin: boolean;
}

const DEFAULT_COLOR = "0969da";

function LabelDialog({ target, label, onClose }: { target: GithubTarget; label: Label | null; onClose: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState(label?.name ?? "");
  const [color, setColor] = useState(label?.color ?? DEFAULT_COLOR);
  const [description, setDescription] = useState(label?.description ?? "");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const hex = normalizeColor(color);
  const ready = name.trim() !== "" && hex !== null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!ready || busy || hex === null) {
      return;
    }
    setBusy(true);
    const saved = label
      ? await changeLabel(target, label.name, { newName: name.trim(), color: hex, description: description.trim() })
      : await addLabel(target, name.trim(), hex, description.trim());
    setBusy(false);
    if (saved) {
      onClose();
    }
  }

  return (
    <Dialog
      open
      title={label ? t("github.settings.labels.editTitle", { name: label.name }) : t("github.settings.labels.newTitle")}
      onClose={onClose}
      dismissible={!busy}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" type="submit" form="label-form" loading={busy}>
            {t("github.settings.save")}
          </Button>
        </>
      }
    >
      <form id="label-form" onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
        <TextField
          data-autofocus
          label={t("github.settings.labels.name")}
          value={name}
          error={touched && name.trim() === "" ? t("github.settings.labels.nameRequired") : undefined}
          onChange={(event) => setName(event.target.value)}
        />
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <TextField
              label={t("github.settings.labels.color")}
              hint={t("github.settings.labels.colorHint")}
              value={color}
              error={touched && hex === null ? t("github.settings.labels.colorInvalid") : undefined}
              onChange={(event) => setColor(event.target.value)}
              spellCheck={false}
            />
          </div>
          <span
            aria-hidden="true"
            className="mb-7 size-8 shrink-0 rounded-md border border-line"
            style={{ backgroundColor: hex ? `#${hex}` : "transparent" }}
          />
        </div>
        <TextField label={t("github.settings.labels.description")} value={description} onChange={(event) => setDescription(event.target.value)} />
      </form>
    </Dialog>
  );
}

export function LabelsSection({ target, canAdmin }: Props) {
  const { t } = useTranslation();
  const labels = useLabels(target);
  const [editing, setEditing] = useState<Label | "new" | null>(null);
  const [removing, setRemoving] = useState<Label | null>(null);
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!removing) {
      return;
    }
    setBusy(true);
    await removeLabel(target, removing.name);
    setBusy(false);
    setRemoving(null);
  }

  return (
    <SectionFrame title={t("github.settings.sections.labels")} description={t("github.settings.labels.intro")}>
      <div>
        <Button variant="primary" icon={<Plus className="size-3.5" />} disabled={!canAdmin} onClick={() => setEditing("new")}>
          {t("github.settings.labels.new")}
        </Button>
      </div>
      {labels.isPending ? (
        <Skeleton className="h-24" />
      ) : labels.isError ? (
        <QueryError error={labels.error} onRetry={() => void labels.refetch()} />
      ) : labels.data.length === 0 ? (
        <p className="text-xs text-muted">{t("github.settings.labels.none")}</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line" aria-label={t("github.settings.sections.labels")}>
          {labels.data.map((label) => (
            <li key={label.name} className="flex items-center gap-2.5 px-3 py-2">
              <span aria-hidden="true" className="size-3 shrink-0 rounded-full" style={{ backgroundColor: `#${label.color}` }} />
              <span className="shrink-0 text-[13px] font-medium">{label.name}</span>
              <span className="min-w-0 flex-1 truncate text-xs text-muted">{label.description}</span>
              <IconButton label={t("github.settings.labels.edit", { name: label.name })} disabled={!canAdmin} onClick={() => setEditing(label)}>
                <Pencil className="size-4" />
              </IconButton>
              <IconButton label={t("github.settings.labels.remove", { name: label.name })} disabled={!canAdmin} onClick={() => setRemoving(label)}>
                <Trash2 className="size-4" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      {editing ? (
        <LabelDialog key={editing === "new" ? "new" : editing.name} target={target} label={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      ) : null}
      <ConfirmDialog
        open={removing !== null}
        title={t("github.settings.labels.removeTitle", { name: removing?.name ?? "" })}
        description={t("github.settings.labels.removeDescription")}
        confirmLabel={t("github.settings.labels.removeConfirm")}
        destructive
        loading={busy}
        onConfirm={() => void remove()}
        onCancel={() => setRemoving(null)}
      />
    </SectionFrame>
  );
}

function MilestoneDialog({ target, milestone, onClose }: { target: GithubTarget; milestone: Milestone | null; onClose: () => void }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(milestone?.title ?? "");
  const [description, setDescription] = useState(milestone?.description ?? "");
  const [due, setDue] = useState(isoToDueDate(milestone?.dueOn ?? null));
  const [closed, setClosed] = useState(milestone?.state === "closed");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const dueIso = due === "" ? null : dueDateToIso(due);
  const ready = title.trim() !== "" && (due === "" || dueIso !== null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!ready || busy) {
      return;
    }
    setBusy(true);
    const saved = milestone
      ? await changeMilestone(target, milestone.number, {
          title: title.trim(),
          description,
          ...(dueIso ? { dueOn: dueIso } : { clearDue: true }),
          state: closed ? "closed" : "open",
        })
      : await addMilestone(target, title.trim(), description, dueIso);
    setBusy(false);
    if (saved) {
      onClose();
    }
  }

  return (
    <Dialog
      open
      title={milestone ? t("github.settings.milestones.editTitle", { title: milestone.title }) : t("github.settings.milestones.newTitle")}
      onClose={onClose}
      dismissible={!busy}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" type="submit" form="milestone-form" loading={busy}>
            {t("github.settings.save")}
          </Button>
        </>
      }
    >
      <form id="milestone-form" onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
        <TextField
          data-autofocus
          label={t("github.settings.milestones.titleLabel")}
          value={title}
          error={touched && title.trim() === "" ? t("github.settings.milestones.titleRequired") : undefined}
          onChange={(event) => setTitle(event.target.value)}
        />
        <TextField label={t("github.settings.milestones.description")} value={description} onChange={(event) => setDescription(event.target.value)} />
        <TextField type="date" label={t("github.settings.milestones.due")} value={due} onChange={(event) => setDue(event.target.value)} />
        {milestone ? <ToggleRow label={t("github.settings.milestones.closed")} checked={closed} disabled={busy} onChange={setClosed} /> : null}
      </form>
    </Dialog>
  );
}

export function MilestonesSection({ target, canAdmin }: Props) {
  const { t } = useTranslation();
  const milestones = useQuery({
    queryKey: targetKey(target, "milestones", "all"),
    queryFn: () => listMilestones(target, "all"),
    staleTime: 30_000,
    retry: false,
  });
  const [editing, setEditing] = useState<Milestone | "new" | null>(null);
  const [removing, setRemoving] = useState<Milestone | null>(null);
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!removing) {
      return;
    }
    setBusy(true);
    await removeMilestone(target, removing.number);
    setBusy(false);
    setRemoving(null);
  }

  return (
    <SectionFrame title={t("github.settings.sections.milestones")} description={t("github.settings.milestones.intro")}>
      <div>
        <Button variant="primary" icon={<Plus className="size-3.5" />} disabled={!canAdmin} onClick={() => setEditing("new")}>
          {t("github.settings.milestones.new")}
        </Button>
      </div>
      {milestones.isPending ? (
        <Skeleton className="h-24" />
      ) : milestones.isError ? (
        <QueryError error={milestones.error} onRetry={() => void milestones.refetch()} />
      ) : milestones.data.length === 0 ? (
        <p className="text-xs text-muted">{t("github.settings.milestones.none")}</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line" aria-label={t("github.settings.sections.milestones")}>
          {milestones.data.map((milestone) => (
            <li key={milestone.number} className="flex items-center gap-2.5 px-3 py-2">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[13px] font-medium">
                  {milestone.title}
                  {milestone.state === "closed" ? (
                    <span className="ml-2 rounded-full bg-subtle px-1.5 py-px text-[10px] font-normal text-muted">{t("github.settings.milestones.closedBadge")}</span>
                  ) : null}
                </span>
                <span className="truncate text-[11px] text-muted">
                  {t("github.collab.milestoneProgress", { open: milestone.openIssues, closed: milestone.closedIssues })}
                  {milestone.dueOn ? ` · ${isoToDueDate(milestone.dueOn)}` : ""}
                </span>
              </div>
              <IconButton label={t("github.settings.milestones.edit", { title: milestone.title })} disabled={!canAdmin} onClick={() => setEditing(milestone)}>
                <Pencil className="size-4" />
              </IconButton>
              <IconButton label={t("github.settings.milestones.remove", { title: milestone.title })} disabled={!canAdmin} onClick={() => setRemoving(milestone)}>
                <Trash2 className="size-4" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      {editing ? (
        <MilestoneDialog
          key={editing === "new" ? "new" : editing.number}
          target={target}
          milestone={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
      <ConfirmDialog
        open={removing !== null}
        title={t("github.settings.milestones.removeTitle", { title: removing?.title ?? "" })}
        description={t("github.settings.milestones.removeDescription")}
        confirmLabel={t("github.settings.milestones.removeConfirm")}
        destructive
        loading={busy}
        onConfirm={() => void remove()}
        onCancel={() => setRemoving(null)}
      />
    </SectionFrame>
  );
}
