import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { TextAreaField, TextField } from "@/shared/ui/text-field";
import { useRepoInfo } from "../../pulls/queries";
import type { GithubTarget } from "../../target";
import { useWorkflows } from "../queries";
import { parseWorkflowInputs } from "../run-model";
import { startWorkflow } from "../run-actions";

interface DispatchDialogProps {
  open: boolean;
  target: GithubTarget;
  onClose: () => void;
}

function DispatchForm({ target, onClose }: Omit<DispatchDialogProps, "open">) {
  const { t } = useTranslation();
  const workflows = useWorkflows(target, true);
  const info = useRepoInfo(target);
  const [chosen, setChosen] = useState<number | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const [inputsText, setInputsText] = useState("");
  const [busy, setBusy] = useState(false);

  const active = (workflows.data ?? []).filter((workflow) => workflow.state === "active");
  const workflowId = chosen ?? active[0]?.id ?? null;
  const effectiveRef = reference ?? info.data?.defaultBranch ?? "";
  const parsed = parseWorkflowInputs(inputsText);
  const inputsError =
    parsed.invalidLines.length > 0 ? t("github.actions.dispatch.invalidInputs", { lines: parsed.invalidLines.join(", ") }) : undefined;
  const canSubmit = workflowId !== null && effectiveRef.trim().length > 0 && !inputsError;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit || busy || workflowId === null) {
      return;
    }
    setBusy(true);
    const started = await startWorkflow(target, workflowId, effectiveRef.trim(), parsed.values);
    setBusy(false);
    if (started) {
      onClose();
    }
  }

  return (
    <Dialog
      open
      title={t("github.actions.dispatch.title")}
      description={t("github.actions.dispatch.description", { repo: `${target.owner}/${target.repo}` })}
      onClose={onClose}
      width="md"
      dismissible={!busy}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" type="submit" form="dispatch-workflow-form" disabled={!canSubmit} loading={busy}>
            {t("github.actions.dispatch.submit")}
          </Button>
        </>
      }
    >
      {workflows.isPending ? (
        <p className="text-xs text-muted">{t("github.actions.dispatch.loading")}</p>
      ) : active.length === 0 ? (
        <p className="text-xs text-muted">{t("github.actions.dispatch.none")}</p>
      ) : (
        <form id="dispatch-workflow-form" onSubmit={(event) => void submit(event)} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="dispatch-workflow" className="text-xs font-medium">
              {t("github.actions.dispatch.workflow")}
            </label>
            <select
              id="dispatch-workflow"
              value={workflowId ?? ""}
              onChange={(event) => setChosen(Number(event.target.value))}
              className="h-8 cursor-pointer rounded-md border border-line bg-surface px-2 text-[13px] text-fg focus-visible:border-accent focus-visible:outline-none"
            >
              {active.map((workflow) => (
                <option key={workflow.id} value={workflow.id}>
                  {workflow.name} ({workflow.path})
                </option>
              ))}
            </select>
          </div>
          <TextField
            data-autofocus
            label={t("github.actions.dispatch.reference")}
            value={effectiveRef}
            onChange={(event) => setReference(event.target.value)}
          />
          <TextAreaField
            label={t("github.actions.dispatch.inputs")}
            hint={t("github.actions.dispatch.inputsHint")}
            error={inputsError}
            rows={4}
            value={inputsText}
            onChange={(event) => setInputsText(event.target.value)}
            className="font-mono text-xs"
          />
        </form>
      )}
    </Dialog>
  );
}

export function DispatchDialog({ open, target, onClose }: DispatchDialogProps) {
  if (!open) {
    return null;
  }
  return <DispatchForm target={target} onClose={onClose} />;
}
