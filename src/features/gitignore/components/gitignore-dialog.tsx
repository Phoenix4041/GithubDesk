import { Check, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { rankItems } from "@/features/commands/command-model";
import { cn } from "@/shared/lib/cn";
import { describeError, reportError } from "@/shared/lib/report-error";
import type { IgnoreMatch } from "@/shared/types/git";
import { Button } from "@/shared/ui/button";
import { CodeEditor } from "@/shared/ui/code-editor";
import { Dialog } from "@/shared/ui/dialog";
import { ErrorState } from "@/shared/ui/error-state";
import { SearchInput } from "@/shared/ui/search-input";
import { Skeleton } from "@/shared/ui/skeleton";
import { TextField } from "@/shared/ui/text-field";
import { untrackIgnoredFiles, saveIgnoreFile } from "../actions";
import { checkIgnored } from "../api";
import { isTemplateApplied, mergeTemplate } from "../gitignore-model";
import { useIgnoredTracked, useIgnoreFile } from "../queries";
import { useGitignoreDialogStore } from "../store";
import { IGNORE_TEMPLATES } from "../templates";

type Section = "editor" | "templates" | "check";

interface BodyProps {
  repoPath: string;
  initial: string;
  onClose: () => void;
}

function CheckSection({ repoPath, dirty }: { repoPath: string; dirty: boolean }) {
  const { t } = useTranslation();
  const tracked = useIgnoredTracked(repoPath, !dirty);
  const [path, setPath] = useState("");
  const [result, setResult] = useState<IgnoreMatch | null>(null);
  const [busy, setBusy] = useState(false);

  async function check(event: FormEvent) {
    event.preventDefault();
    if (path.trim() === "" || busy) {
      return;
    }
    setBusy(true);
    try {
      const matches = await checkIgnored(repoPath, [path.trim()]);
      setResult(matches[0] ?? null);
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {dirty ? <p className="text-xs text-warning">{t("gitignore.saveFirst")}</p> : null}
      <form onSubmit={(event) => void check(event)} className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <TextField
            label={t("gitignore.checkLabel")}
            placeholder="src/debug.log"
            value={path}
            disabled={dirty}
            onChange={(event) => {
              setPath(event.target.value);
              setResult(null);
            }}
            spellCheck={false}
          />
        </div>
        <Button type="submit" disabled={dirty || path.trim() === ""} loading={busy}>
          {t("gitignore.check")}
        </Button>
      </form>
      {result ? (
        <p
          role="status"
          className={cn(
            "rounded-md px-3 py-2 text-xs",
            result.ignored ? "bg-add-bg text-add" : "bg-subtle text-muted",
          )}
        >
          {result.ignored
            ? t("gitignore.resultIgnored", {
                pattern: result.pattern ?? "",
                source: result.source ?? "",
                line: result.line ?? 0,
              })
            : t("gitignore.resultNotIgnored")}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 border-t border-line pt-3">
        <h3 className="text-[11px] font-semibold tracking-wide text-muted uppercase">{t("gitignore.trackedTitle")}</h3>
        {dirty ? null : tracked.isPending ? (
          <Skeleton className="h-8" />
        ) : tracked.isError ? (
          <ErrorState
            title={describeError(tracked.error).title}
            message={describeError(tracked.error).message}
            onRetry={() => void tracked.refetch()}
          />
        ) : tracked.data.length === 0 ? (
          <p className="text-xs text-muted">{t("gitignore.trackedNone")}</p>
        ) : (
          <>
            <p className="text-xs text-muted">{t("gitignore.trackedHint")}</p>
            <ul className="max-h-32 overflow-y-auto rounded-md border border-line">
              {tracked.data.map((item) => (
                <li key={item} className="truncate border-b border-line px-2.5 py-1 font-mono text-[11px] last:border-b-0">
                  {item}
                </li>
              ))}
            </ul>
            <Button className="w-fit" onClick={() => void untrackIgnoredFiles(repoPath, tracked.data)}>
              {t("gitignore.untrackAll", { count: tracked.data.length })}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function GitignoreBody({ repoPath, initial, onClose }: BodyProps) {
  const { t } = useTranslation();
  const [content, setContent] = useState(initial);
  const [section, setSection] = useState<Section>("editor");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const dirty = content !== initial;

  const templates = useMemo(
    () => rankItems(IGNORE_TEMPLATES.map((template) => ({ template, title: template.name, keywords: template.id })), query),
    [query],
  );

  async function save() {
    setBusy(true);
    const succeeded = await saveIgnoreFile(repoPath, content);
    setBusy(false);
    if (succeeded) {
      onClose();
    }
  }

  const sections: Array<{ id: Section; label: string }> = [
    { id: "editor", label: t("gitignore.sections.editor") },
    { id: "templates", label: t("gitignore.sections.templates") },
    { id: "check", label: t("gitignore.sections.check") },
  ];

  return (
    <Dialog
      open
      title={t("gitignore.title")}
      description={t("gitignore.description")}
      onClose={onClose}
      width="lg"
      dismissible={!busy}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {dirty ? t("common.cancel") : t("common.close")}
          </Button>
          <Button variant="primary" onClick={() => void save()} disabled={!dirty} loading={busy}>
            {t("gitignore.save")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div role="tablist" aria-label={t("gitignore.sectionsLabel")} className="inline-flex w-fit gap-1 rounded-lg bg-subtle p-1">
          {sections.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={section === item.id}
              onClick={() => setSection(item.id)}
              className={cn(
                "h-7 cursor-pointer rounded-md px-3 text-xs font-medium transition-colors duration-150",
                section === item.id ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        {section === "editor" ? (
          <div className="h-[320px] overflow-hidden rounded-md border border-line">
            <CodeEditor value={content} onChange={setContent} ariaLabel={t("gitignore.editorLabel")} />
          </div>
        ) : null}

        {section === "templates" ? (
          <div className="flex flex-col gap-2">
            <SearchInput label={t("gitignore.searchTemplates")} value={query} onValueChange={setQuery} />
            {note ? (
              <p role="status" className="text-xs text-muted">
                {note}
              </p>
            ) : null}
            <ul className="grid max-h-[290px] grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
              {templates.map(({ template }) => {
                const applied = isTemplateApplied(content, template);
                return (
                  <li key={template.id} className="flex items-center gap-2 rounded-md border border-line px-2.5 py-1.5">
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[13px] font-medium">{template.name}</span>
                      <span className="text-[11px] text-muted">{t("gitignore.templateLines", { count: template.lines.length })}</span>
                    </div>
                    <Button
                      size="sm"
                      icon={applied ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
                      aria-label={t("gitignore.addTemplate", { name: template.name })}
                      onClick={() => {
                        const merged = mergeTemplate(content, template);
                        setContent(merged.content);
                        setNote(
                          merged.added === 0
                            ? t("gitignore.nothingNew", { name: template.name })
                            : t("gitignore.templateAdded", { name: template.name, count: merged.added }),
                        );
                      }}
                    >
                      {applied ? t("gitignore.applied") : t("gitignore.add")}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {section === "check" ? <CheckSection repoPath={repoPath} dirty={dirty} /> : null}
      </div>
    </Dialog>
  );
}

function GitignoreLoader({ repoPath, onClose }: { repoPath: string; onClose: () => void }) {
  const { t } = useTranslation();
  const file = useIgnoreFile(repoPath);

  if (file.isError) {
    const description = describeError(file.error);
    return (
      <Dialog open title={t("gitignore.title")} onClose={onClose}>
        <ErrorState title={description.title} message={description.message} onRetry={() => void file.refetch()} />
      </Dialog>
    );
  }
  if (!file.data) {
    return (
      <Dialog open title={t("gitignore.title")} description={t("gitignore.description")} onClose={onClose} width="lg">
        <Skeleton className="h-[320px]" />
      </Dialog>
    );
  }
  return <GitignoreBody repoPath={repoPath} initial={file.data.content} onClose={onClose} />;
}

export function GitignoreDialog({ repoPath }: { repoPath: string }) {
  const open = useGitignoreDialogStore((state) => state.open);
  const hide = useGitignoreDialogStore((state) => state.hide);
  return open ? <GitignoreLoader repoPath={repoPath} onClose={hide} /> : null;
}
