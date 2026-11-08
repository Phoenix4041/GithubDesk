import { Sparkles } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useTags } from "@/features/tags/queries";
import { reportError } from "@/shared/lib/report-error";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { TextAreaField, TextField } from "@/shared/ui/text-field";
import { ToggleRow } from "../../settings/components/section-frame";
import type { GithubTarget } from "../../target";
import { editRelease, publishNewRelease } from "../actions";
import { generateNotes } from "../api";
import { previousTagOf, tagProblem } from "../releases-model";
import type { Release } from "../releases-model";

interface Props {
  target: GithubTarget;
  repoPath: string;
  release: Release | null;
  onClose: () => void;
}

export function ReleaseDialog({ target, repoPath, release, onClose }: Props) {
  const { t } = useTranslation();
  const tags = useTags(repoPath);
  const editing = release !== null;
  const [tag, setTag] = useState(release?.tagName ?? "");
  const [branch, setBranch] = useState("");
  const [name, setName] = useState(release?.name ?? "");
  const [body, setBody] = useState(release?.body ?? "");
  const [draft, setDraft] = useState(release?.draft ?? false);
  const [prerelease, setPrerelease] = useState(release?.prerelease ?? false);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [writing, setWriting] = useState(false);
  const problem = editing ? null : tagProblem(tag);
  const names = [...(tags.data ?? [])].sort((left, right) => right.time - left.time).map((entry) => entry.name);

  async function writeNotes() {
    if (tagProblem(tag) !== null) {
      setTouched(true);
      return;
    }
    setWriting(true);
    try {
      const notes = await generateNotes(target, tag.trim(), branch.trim() === "" ? null : branch.trim(), previousTagOf(names, tag.trim()));
      setBody(notes.body);
      setName((current) => (current.trim() === "" ? notes.name : current));
    } catch (error) {
      reportError(error);
    }
    setWriting(false);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (problem !== null || busy) {
      return;
    }
    setBusy(true);
    const saved = release
      ? await editRelease(target, release.id, { name, body, draft, prerelease })
      : (await publishNewRelease(target, { tagName: tag.trim(), target: branch.trim() === "" ? null : branch.trim(), name, body, draft, prerelease })) !== null;
    setBusy(false);
    if (saved) {
      onClose();
    }
  }

  return (
    <Dialog
      open
      title={editing ? t("github.releases.editTitle", { tag: release.tagName }) : t("github.releases.newTitle")}
      onClose={onClose}
      dismissible={!busy}
      width="lg"
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" type="submit" form="release-form" loading={busy}>
            {editing ? t("github.settings.save") : draft ? t("github.releases.saveDraft") : t("github.releases.publish")}
          </Button>
        </>
      }
    >
      <form id="release-form" onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
        <div className="flex gap-3">
          <div className="flex-1">
            <TextField
              data-autofocus={!editing}
              label={t("github.releases.tag")}
              hint={editing ? undefined : t("github.releases.tagHint")}
              value={tag}
              readOnly={editing}
              list="release-tags"
              error={touched && problem ? t(`github.releases.tagProblems.${problem}`) : undefined}
              onChange={(event) => setTag(event.target.value)}
              spellCheck={false}
            />
            <datalist id="release-tags">
              {names.map((entry) => (
                <option key={entry} value={entry} />
              ))}
            </datalist>
          </div>
          {editing ? null : (
            <div className="flex-1">
              <TextField
                label={t("github.releases.target")}
                hint={t("github.releases.targetHint")}
                value={branch}
                onChange={(event) => setBranch(event.target.value)}
                spellCheck={false}
              />
            </div>
          )}
        </div>
        <TextField label={t("github.releases.title")} value={name} onChange={(event) => setName(event.target.value)} />
        <div className="flex flex-col gap-1.5">
          <TextAreaField label={t("github.releases.notes")} rows={9} value={body} onChange={(event) => setBody(event.target.value)} />
          {editing ? null : (
            <div>
              <Button size="sm" icon={<Sparkles className="size-3.5" />} loading={writing} onClick={() => void writeNotes()}>
                {t("github.releases.generate")}
              </Button>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <ToggleRow label={t("github.releases.draft")} hint={t("github.releases.draftHint")} checked={draft} disabled={busy} onChange={setDraft} />
          <ToggleRow label={t("github.releases.prerelease")} checked={prerelease} disabled={busy} onChange={setPrerelease} />
        </div>
      </form>
    </Dialog>
  );
}
