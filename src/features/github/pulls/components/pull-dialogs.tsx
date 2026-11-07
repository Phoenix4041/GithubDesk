import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { TextAreaField, TextField } from "@/shared/ui/text-field";
import type { GithubTarget } from "../../target";
import type { MergeMethod, PullRequest } from "../../types";
import { mergeExistingPull, sendReview } from "../actions";

interface MergeDialogProps {
  open: boolean;
  target: GithubTarget;
  pull: PullRequest;
  methods: MergeMethod[];
  onClose: () => void;
}

export function MergeDialog({ open, target, pull, methods, onClose }: MergeDialogProps) {
  const { t } = useTranslation();
  const [chosen, setChosen] = useState<MergeMethod | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const method = chosen && methods.includes(chosen) ? chosen : (methods[0] ?? "merge");
  const showMessage = method !== "rebase";
  const defaultTitle = method === "squash" ? `${pull.title} (#${pull.number})` : `Merge pull request #${pull.number} from ${pull.head.label || pull.head.refName}`;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) {
      return;
    }
    setBusy(true);
    const merged = await mergeExistingPull(
      target,
      pull.number,
      method,
      showMessage ? (title ?? defaultTitle) : null,
      showMessage ? message : null,
    );
    setBusy(false);
    if (merged) {
      onClose();
    }
  }

  return (
    <Dialog
      open={open}
      title={t("github.pulls.merge.title", { number: pull.number })}
      description={t("github.pulls.merge.description", { head: pull.head.refName, base: pull.base.refName })}
      onClose={onClose}
      width="md"
      dismissible={!busy}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" type="submit" form="merge-pull-form" loading={busy}>
            {t("github.pulls.merge.confirm")}
          </Button>
        </>
      }
    >
      <form id="merge-pull-form" onSubmit={(event) => void submit(event)} className="flex flex-col gap-3">
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-xs font-medium">{t("github.pulls.merge.method")}</legend>
          {methods.map((candidate) => (
            <label key={candidate} className="flex cursor-pointer items-start gap-2 text-[13px]">
              <input
                type="radio"
                name="merge-method"
                checked={method === candidate}
                onChange={() => setChosen(candidate)}
                className="mt-1 size-3.5 cursor-pointer accent-accent"
              />
              <span className="flex flex-col">
                <span className="font-medium">{t(`github.pulls.merge.methods.${candidate}.label`)}</span>
                <span className="text-xs text-muted">{t(`github.pulls.merge.methods.${candidate}.hint`)}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {showMessage ? (
          <>
            <TextField
              label={t("github.pulls.merge.commitTitle")}
              value={title ?? defaultTitle}
              onChange={(event) => setTitle(event.target.value)}
            />
            <TextAreaField
              label={t("github.pulls.merge.commitMessage")}
              rows={3}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />
          </>
        ) : null}
      </form>
    </Dialog>
  );
}

interface ReviewDialogProps {
  open: boolean;
  target: GithubTarget;
  number: number;
  isOwnPull: boolean;
  onClose: () => void;
}

const EVENTS = ["COMMENT", "APPROVE", "REQUEST_CHANGES"] as const;

export function ReviewDialog({ open, target, number, isOwnPull, onClose }: ReviewDialogProps) {
  const { t } = useTranslation();
  const [event, setEvent] = useState<(typeof EVENTS)[number]>("COMMENT");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const needsText = event !== "APPROVE";
  const canSubmit = !needsText || body.trim().length > 0;
  const options = isOwnPull ? EVENTS.filter((item) => item === "COMMENT") : EVENTS;

  async function submit(submitEvent: FormEvent) {
    submitEvent.preventDefault();
    if (!canSubmit || busy) {
      return;
    }
    setBusy(true);
    const sent = await sendReview(target, number, event, body);
    setBusy(false);
    if (sent) {
      setBody("");
      onClose();
    }
  }

  return (
    <Dialog
      open={open}
      title={t("github.pulls.review.title")}
      description={isOwnPull ? t("github.pulls.review.ownPull") : t("github.pulls.review.description")}
      onClose={onClose}
      width="md"
      dismissible={!busy}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" type="submit" form="review-pull-form" disabled={!canSubmit} loading={busy}>
            {t("github.pulls.review.submit")}
          </Button>
        </>
      }
    >
      <form id="review-pull-form" onSubmit={(submitEvent) => void submit(submitEvent)} className="flex flex-col gap-3">
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-xs font-medium">{t("github.pulls.review.decision")}</legend>
          {options.map((item) => (
            <label key={item} className="flex cursor-pointer items-center gap-2 text-[13px]">
              <input
                type="radio"
                name="review-event"
                checked={event === item}
                onChange={() => setEvent(item)}
                className="size-3.5 cursor-pointer accent-accent"
              />
              {t(`github.pulls.review.events.${item}`)}
            </label>
          ))}
        </fieldset>
        <TextAreaField
          data-autofocus
          label={t("github.pulls.review.comment")}
          rows={5}
          value={body}
          onChange={(changeEvent) => setBody(changeEvent.target.value)}
        />
      </form>
    </Dialog>
  );
}
