import type { ParseKeys } from "i18next";
import { ArrowDown, ArrowUp, GripVertical, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { getCommitDetail } from "@/features/history/api";
import { usePointerReorder } from "@/shared/hooks/use-pointer-reorder";
import { cn } from "@/shared/lib/cn";
import { describeError } from "@/shared/lib/report-error";
import type { RebaseAction, RebasePlan } from "@/shared/types/git";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { ErrorState } from "@/shared/ui/error-state";
import { IconButton } from "@/shared/ui/icon-button";
import { SkeletonRows } from "@/shared/ui/skeleton";
import { TextAreaField } from "@/shared/ui/text-field";
import { runInteractiveRebase } from "../actions";
import { useRebasePlan } from "../queries";
import {
  createDraft,
  isHeadAction,
  isUnchanged,
  moveStep,
  needsFinalMessage,
  rewritesPublishedCommits,
  toPayload,
  validateDraft,
} from "../rebase-model";
import type { DraftStep } from "../rebase-model";
import { useRebaseDialogStore } from "../store";

interface RebaseDialogProps {
  repoPath: string;
}

interface DraftEditorProps {
  repoPath: string;
  plan: RebasePlan;
  onClose: () => void;
}

const ACTIONS: Array<{ action: RebaseAction; labelKey: ParseKeys }> = [
  { action: "pick", labelKey: "rebase.actions.pick" },
  { action: "reword", labelKey: "rebase.actions.reword" },
  { action: "edit", labelKey: "rebase.actions.edit" },
  { action: "squash", labelKey: "rebase.actions.squash" },
  { action: "fixup", labelKey: "rebase.actions.fixup" },
  { action: "drop", labelKey: "rebase.actions.drop" },
];

const selectClasses =
  "h-7 cursor-pointer rounded-md border border-line bg-surface px-1.5 text-xs text-fg focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:outline-none";

function DraftEditor({ repoPath, plan, onClose }: DraftEditorProps) {
  const { t } = useTranslation();
  const [steps, setSteps] = useState<DraftStep[]>(() => createDraft(plan));
  const [busy, setBusy] = useState(false);

  const problem = validateDraft(steps);
  const unchanged = isUnchanged(steps, plan);
  const warnPublished = rewritesPublishedCommits(steps, plan);
  const { listRef, dragging, gripProps } = usePointerReorder({
    count: steps.length,
    disabled: busy,
    onMove: (from, to) => setSteps((current) => moveStep(current, from, to)),
  });

  function update(index: number, patch: Partial<DraftStep>) {
    setSteps((current) => current.map((step, position) => (position === index ? { ...step, ...patch } : step)));
  }

  async function changeAction(index: number, action: RebaseAction) {
    update(index, { action });
    const step = steps[index];
    if (action === "reword" && step && step.message.trim().length === 0) {
      try {
        const detail = await getCommitDetail(repoPath, step.hash);
        if (detail) {
          const text = detail.body ? `${detail.summary.subject}\n\n${detail.body}` : detail.summary.subject;
          setSteps((current) =>
            current.map((candidate) =>
              candidate.hash === step.hash && candidate.message.trim().length === 0 ? { ...candidate, message: text } : candidate,
            ),
          );
        }
      } catch {
        update(index, { message: step.subject });
      }
    }
  }

  async function start() {
    setBusy(true);
    await runInteractiveRebase(repoPath, plan.base, toPayload(steps));
    setBusy(false);
    onClose();
  }

  return (
    <Dialog
      open
      title={t("rebase.title", { count: steps.length })}
      description={t("rebase.description")}
      onClose={onClose}
      width="lg"
      dismissible={!busy}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" disabled={unchanged || problem !== null} loading={busy} onClick={() => void start()}>
            {t("rebase.start")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {warnPublished ? (
          <div className="flex gap-2.5 rounded-lg bg-danger-soft p-3 text-xs" role="alert">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" />
            <p>{t("rebase.publishedWarning")}</p>
          </div>
        ) : null}
        {problem ? (
          <p role="alert" className="text-xs text-danger">
            {t(problem === "firstSquash" ? "rebase.problems.firstSquash" : "rebase.problems.emptyReword")}
          </p>
        ) : null}
        <ol ref={listRef} className="flex flex-col gap-1.5" aria-label={t("rebase.listLabel")}>
          {steps.map((step, index) => (
            <li
              key={step.hash}
              className={cn(
                "flex flex-col gap-1.5 rounded-lg border border-line p-2 transition-colors duration-150",
                dragging === index && "border-accent bg-accent-soft/50",
              )}
            >
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label={t("rebase.drag", { subject: step.subject })}
                  title={t("rebase.dragHint")}
                  disabled={busy}
                  className={cn(
                    "grid size-6 shrink-0 touch-none place-items-center rounded-md text-muted transition-colors duration-150 hover:bg-subtle hover:text-fg disabled:cursor-not-allowed disabled:opacity-40",
                    dragging === index ? "cursor-grabbing" : "cursor-grab",
                  )}
                  {...gripProps(index)}
                >
                  <GripVertical className="size-3.5" />
                </button>
                <div className="flex shrink-0 items-center">
                  <IconButton
                    label={t("rebase.moveUp")}
                    disabled={index === 0 || busy}
                    onClick={() => setSteps((current) => moveStep(current, index, index - 1))}
                    className="size-6"
                  >
                    <ArrowUp className="size-3.5" />
                  </IconButton>
                  <IconButton
                    label={t("rebase.moveDown")}
                    disabled={index === steps.length - 1 || busy}
                    onClick={() => setSteps((current) => moveStep(current, index, index + 1))}
                    className="size-6"
                  >
                    <ArrowDown className="size-3.5" />
                  </IconButton>
                </div>
                <select
                  aria-label={t("rebase.actionLabel", { subject: step.subject })}
                  value={step.action}
                  disabled={busy}
                  onChange={(event) => void changeAction(index, event.target.value as RebaseAction)}
                  className={selectClasses}
                >
                  {ACTIONS.map((item) => (
                    <option key={item.action} value={item.action}>
                      {t(item.labelKey)}
                    </option>
                  ))}
                </select>
                <span className="shrink-0 font-mono text-[11px] text-muted">{step.shortHash}</span>
                <span
                  className={`min-w-0 flex-1 truncate text-[13px] ${step.action === "drop" ? "text-muted line-through" : "font-medium"}`}
                  title={step.subject}
                >
                  {step.subject}
                </span>
                {step.pushed ? (
                  <span className="shrink-0 rounded-full bg-subtle px-1.5 py-px text-[10px] text-muted">{t("rebase.published")}</span>
                ) : null}
              </div>
              {isHeadAction(step.action) && needsFinalMessage(steps, index) ? (
                <TextAreaField
                  label={step.action === "reword" ? t("rebase.messageReword") : t("rebase.messageCombined")}
                  hint={step.action === "reword" ? undefined : t("rebase.messageCombinedHint")}
                  rows={3}
                  value={step.message}
                  disabled={busy}
                  onChange={(event) => update(index, { message: event.target.value })}
                />
              ) : null}
            </li>
          ))}
        </ol>
      </div>
    </Dialog>
  );
}

export function RebaseDialog({ repoPath }: RebaseDialogProps) {
  const { t } = useTranslation();
  const target = useRebaseDialogStore((state) => state.target);
  const hide = useRebaseDialogStore((state) => state.hide);
  const plan = useRebasePlan(repoPath, target?.base ?? "");

  if (!target) {
    return null;
  }
  if (plan.isPending || plan.isError) {
    const description = plan.isError ? describeError(plan.error) : null;
    return (
      <Dialog
        open
        title={t("rebase.loadingTitle")}
        onClose={hide}
        width="md"
        footer={<Button onClick={hide}>{t("common.close")}</Button>}
      >
        {description ? (
          <ErrorState title={description.title} message={description.message} onRetry={() => void plan.refetch()} />
        ) : (
          <SkeletonRows count={4} rowHeight={40} />
        )}
      </Dialog>
    );
  }
  return <DraftEditor key={target.base} repoPath={repoPath} plan={plan.data} onClose={hide} />;
}
